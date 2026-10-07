// Pure Stripe-to-AutoDash conversions (no database or network), so they can be unit tested.
import { dayKey } from "../utils/time.ts";
import type { BillingSettings, Invoice, InvoiceItem } from "./types.ts";

const DEFAULT_TZ = "America/Chicago";
// ---- Stripe's shapes (only the fields used) ----
type Line = { description?: string | null; amount: number; price?: { nickname?: string | null; product?: string | { name?: string } | null } | null; period?: { start: number; end: number } };
export type StripeInvoice = {
  id: string; number?: string | null; status: string; created: number; due_date?: number | null; period_end?: number; period_start?: number;
  subtotal: number; total: number; tax?: number | null; total_taxes?: { amount: number }[] | null;
  total_discount_amounts?: { amount: number }[] | null; hosted_invoice_url?: string | null; paid_out_of_band?: boolean;
  status_transitions?: { paid_at?: number | null } | null; attempt_count?: number; amount_remaining?: number;
  last_finalization_error?: { message?: string } | null; collection_method?: string; next_payment_attempt?: number | null;
  lines?: { data: Line[] };
};

export const day = (unix: number, tz: string) => dayKey(unix * 1000, tz);

/** One Stripe invoice, as AutoDash's own bill shape. Draft invoices aren't shown (they aren't the customer's yet). Pure: unit tested. */
export function mapStripeInvoice(raw: StripeInvoice, tz = DEFAULT_TZ): Invoice | null {
  if (raw.status === "draft") return null;
  const lines = raw.lines?.data ?? [];
  const items: InvoiceItem[] = lines.map((l) => {
    const product = l.price?.product && typeof l.price.product === "object" ? l.price.product.name : null;
    const label = (l.description || l.price?.nickname || product || "Charge").slice(0, 120);
    return { label, cents: l.amount }; // no date ranges: Stripe's service periods ("Oct 7 to Oct 8") only confuse a customer
  });
  const discount = (raw.total_discount_amounts ?? []).reduce((n, d) => n + d.amount, 0);
  if (discount > 0) items.push({ label: "Discount", cents: -discount });
  const tax = raw.tax ?? (raw.total_taxes ?? []).reduce((n, t) => n + t.amount, 0);
  const status: Invoice["status"] = raw.status === "paid" ? "paid" : raw.status === "open" ? "open" : "void";
  if (status === "void") return null;
  const created = day(raw.created, tz);
  const periodStart = raw.period_start ?? raw.created;
  const failed = status === "open" && (raw.attempt_count ?? 0) > 0;
  return {
    id: raw.created, // only used to tell bills apart on the page
    period: day(Math.max(periodStart, raw.created - 5 * 86400), tz).slice(0, 7),
    number: raw.number || raw.id,
    items, subtotal: items.reduce((n, i) => n + i.cents, 0), tax, total: raw.total, status,
    dueDate: raw.due_date ? day(raw.due_date, tz) : created,
    paidAt: raw.status_transitions?.paid_at ? raw.status_transitions.paid_at * 1000 : null, createdAt: raw.created * 1000,
    method: status === "paid" ? (raw.paid_out_of_band ? "other" : "card") : null,
    note: failed ? "The last payment attempt didn't go through. Pay with the button below, or change the card." : null,
    hostedUrl: raw.hosted_invoice_url ?? null, source: "stripe", stripeId: raw.id,
  };
}

/** The charge lines for a month's AI emails and texts beyond the monthly allowance. Pure: unit tested. */
export function usageCharges(used: { emails: number; texts: number }, s: Pick<BillingSettings, "includedEmails" | "includedTexts" | "extraEmailCents" | "extraTextCents">, label: string) {
  const out: { kind: "emails" | "texts"; description: string; cents: number }[] = [];
  const e = Math.max(0, used.emails - s.includedEmails);
  const t = Math.max(0, used.texts - s.includedTexts);
  if (e && s.extraEmailCents) out.push({ kind: "emails", description: `Extra AI emails: ${e.toLocaleString("en-US")} over the included ${s.includedEmails.toLocaleString("en-US")} in ${label}`, cents: e * s.extraEmailCents });
  if (t && s.extraTextCents) out.push({ kind: "texts", description: `Extra AI texts: ${t.toLocaleString("en-US")} over the included ${s.includedTexts.toLocaleString("en-US")} in ${label}`, cents: t * s.extraTextCents });
  return out;
}

