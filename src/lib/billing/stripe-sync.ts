// Stripe mode: when STRIPE_CUSTOMER_ID is set, Stripe is where billing is managed (the subscription, prices, one-time charges,
// discounts, the saved card) and the Billing page in AutoDash shows what Stripe has. Change something in the Stripe dashboard and
// it shows up here within a minute (a Stripe webhook refreshes it at once). AutoDash itself only adds one thing to Stripe:
// the extra-usage charges (AI emails or texts over the monthly allowance), as invoice items that land on the customer's next invoice.
import { dayKey } from "@/lib/utils/time";
import { cached, dropCached } from "@/lib/utils/cache";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { stripeApi, stripeConfigured } from "./stripe";
import { day, mapStripeInvoice, usageCharges, type StripeInvoice } from "./stripe-map";
import type { BillingSettings, Invoice, InvoiceItem } from "./types";

export { mapStripeInvoice, usageCharges };

export const stripeCustomerId = () => String(process.env.STRIPE_CUSTOMER_ID ?? "").trim();
/** True when billing is managed in Stripe: a Stripe key and the customer's id (cus_...) are both set. */
export const stripeBillingOn = () => stripeConfigured() && /^cus_\w+$/.test(stripeCustomerId());
export const stripeDashboardUrl = () => `https://dashboard.stripe.com/${/^(sk|rk)_test_/.test(String(process.env.STRIPE_SECRET_KEY)) ? "test/" : ""}customers/${stripeCustomerId()}`;

export function listStripeInvoices(): Promise<Invoice[]> {
  return cached("stripe:invoices", 45_000, async () => {
    const r = await stripeApi<{ data: StripeInvoice[] }>(`invoices?customer=${encodeURIComponent(stripeCustomerId())}&limit=36&expand[]=data.lines`);
    return r.data.map((i) => mapStripeInvoice(i)).filter((i): i is Invoice => Boolean(i)).sort((a, b) => b.createdAt - a.createdAt);
  });
}

/** Stripe's own preview of the next invoice. Asks about the customer's subscription by id (the documented way, and the only one that
 *  works when the customer has more than one thing going on). Throws Stripe's message if it can't. */
async function previewRaw(): Promise<StripeInvoice> {
  const cus = stripeCustomerId();
  const subs = await stripeApi<{ data: { id: string }[] }>(`subscriptions?customer=${encodeURIComponent(cus)}&limit=1`);
  const form: Record<string, string> = { customer: cus };
  if (subs.data[0]) form.subscription = subs.data[0].id;
  return stripeApi<StripeInvoice>("invoices/create_preview", form);
}

/** What the next invoice will be, from Stripe's own preview (the subscription plus any one-time charges and discounts added in Stripe). */
export function stripeUpcoming(): Promise<{ items: InvoiceItem[]; subtotal: number; tax: number; total: number; date: string | null } | null> {
  return cached("stripe:upcoming", 45_000, async () => {
    try {
      const raw = await previewRaw();
      const mapped = mapStripeInvoice({ ...raw, status: "open" });
      if (!mapped) return null;
      return { items: mapped.items, subtotal: mapped.subtotal, tax: mapped.tax, total: mapped.total, date: raw.next_payment_attempt ? day(raw.next_payment_attempt, dealership.timeZone) : raw.period_end ? day(raw.period_end, dealership.timeZone) : null };
    } catch { return null; } // no subscription yet, or Stripe didn't answer: the page just shows no preview
  });
}

/** The card Stripe will charge (the customer's default, or the subscription's), for the "How you pay" box. */
export function stripeCard(): Promise<{ customer: string; paymentMethod: string; brand: string; last4: string; since: number } | null> {
  return cached("stripe:card", 120_000, async () => {
    type PM = { id: string; card?: { brand: string; last4: string } };
    try {
      const c = await stripeApi<{ invoice_settings?: { default_payment_method?: PM | string | null } }>(`customers/${stripeCustomerId()}?expand[]=invoice_settings.default_payment_method`);
      let pm = c.invoice_settings?.default_payment_method;
      if (!pm || typeof pm === "string") {
        const subs = await stripeApi<{ data: { default_payment_method?: PM | string | null }[] }>(`subscriptions?customer=${stripeCustomerId()}&status=active&limit=1&expand[]=data.default_payment_method`);
        pm = subs.data[0]?.default_payment_method;
      }
      if (!pm || typeof pm === "string" || !pm.card) return null;
      return { customer: stripeCustomerId(), paymentMethod: pm.id, brand: pm.card.brand, last4: pm.card.last4, since: 0 };
    } catch { return null; }
  });
}

/** A Stripe webhook arrived (invoice paid, failed, changed, subscription changed): next page view reads fresh from Stripe. */


export const refreshStripeBilling = () => dropCached("stripe:");

// ---- Extra usage -> Stripe invoice items ----
const usageKey = (period: string) => `stripe_usage_${period}`;

/** Once per finished month: adds the extra-usage charges (if any) to the customer in Stripe. They show up on the next invoice, and
 *  can be changed or removed in the Stripe dashboard before it's sent. Safe to call every 5 minutes: it only acts once per month. */
export async function addUsageChargesToStripe(period: string, used: { emails: number; texts: number }, s: BillingSettings, label: string): Promise<string> {
  if (!stripeBillingOn()) return "off";
  if (await getSetting(usageKey(period)).catch(() => null)) return "already done";
  const charges = usageCharges(used, s, label);
  for (const c of charges) {
    await stripeApi("invoiceitems", {
      customer: stripeCustomerId(), amount: String(c.cents), currency: "usd", description: c.description,
      "metadata[autodash_period]": period, "metadata[autodash_kind]": c.kind,
    }, `autodash-usage-${stripeCustomerId()}-${period}-${c.kind}`);
  }
  await setSetting(usageKey(period), charges.length ? `added ${charges.length}` : "nothing over").catch(() => undefined);
  refreshStripeBilling();
  return charges.length ? `added ${charges.length} extra-usage charge(s) for ${label}` : "no extra usage";
}

/** For the owner/developer when the Billing page has nothing to show: says exactly why (wrong customer id or key mode, no subscription yet, nothing issued yet). */
export function stripeEmptyReason(): Promise<string> {
  return cached("stripe:why", 30_000, async () => {
    try {
      await stripeApi(`customers/${stripeCustomerId()}`);
    } catch (e) {
      return `Stripe couldn't find the customer ${stripeCustomerId()} with the key AutoDash has: ${e instanceof Error ? e.message : "unknown error"}. Check that STRIPE_CUSTOMER_ID and STRIPE_SECRET_KEY are both from the same mode (test or live).`;
    }
    try {
      const subs = await stripeApi<{ data: { id: string; status: string }[] }>(`subscriptions?customer=${stripeCustomerId()}&status=all&limit=3`);
      if (!subs.data.length) return "This customer has no subscription in Stripe yet. In Stripe, open the customer and click Create subscription ($379 a month). The one-time fees already added will go on its first invoice.";
      const bad = subs.data.every((s) => ["incomplete", "incomplete_expired", "canceled"].includes(s.status));
      if (bad) return `The subscription in Stripe is ${subs.data[0].status.replace("_", " ")}, so no bill was issued. Open it in Stripe to finish or recreate it.`;
      try { await previewRaw(); } catch (e) { return `Stripe has a subscription but AutoDash couldn't preview the next bill: ${e instanceof Error ? e.message : "unknown error"}`; }
      return "Stripe hasn't issued a bill for this customer yet (it may still be a draft). Open the customer in Stripe and finalize the invoice.";
    } catch (e) {
      return `Couldn't read subscriptions from Stripe: ${e instanceof Error ? e.message : "unknown error"}. The API key may be missing the permission to read subscriptions.`;
    }
  });
}
