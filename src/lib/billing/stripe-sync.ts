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

/** What the next invoice will be, from Stripe's own preview (the subscription plus any one-time charges and discounts added in Stripe). */
export function stripeUpcoming(): Promise<{ items: InvoiceItem[]; subtotal: number; tax: number; total: number; date: string | null } | null> {
  return cached("stripe:upcoming", 45_000, async () => {
    try {
      let raw: StripeInvoice;
      try { raw = await stripeApi<StripeInvoice>("invoices/create_preview", { customer: stripeCustomerId() }); }
      catch { raw = await stripeApi<StripeInvoice>(`invoices/upcoming?customer=${encodeURIComponent(stripeCustomerId())}`); }
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
