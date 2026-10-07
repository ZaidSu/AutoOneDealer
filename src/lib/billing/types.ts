// Billing shapes and the plan defaults. No database code, so browser components can import it.
/** Bump when the standard plan changes, so saved settings from before are brought up to date once. */
export const PLAN_VERSION = 2;

export type BillingSettings = {
  planVersion: number;
  monthlyCents: number;
  setupFeeCents: number;
  /** One-time phone number fee, first bill only (a separate line from the connection fee). */
  phoneFeeCents: number;
  /** What's included each month before any extra charge. */
  includedEmails: number;
  includedTexts: number;
  /** Price per email or text over the included amount, in cents. */
  extraEmailCents: number;
  extraTextCents: number;
  /** Sales tax rate (8.25 = 8.25%) and the share of the bill it applies to (80 = 80%). */
  taxRatePercent: number;
  taxablePercent: number;
  /** Day of the month a bill is due. */
  dueDay: number;
  /** What a normal month looks like, shown so there are no surprises. */
  emailRange: string;
  textRange: string;
  /** Business billing them (shown on each bill). */
  billedBy: string;
  documents: { title: string; url: string }[];
  /** What the monthly price is made of, shown so the owner can see what they pay for. Should add up to monthlyCents. */
  planParts: { label: string; detail: string; cents: number }[];
};

export const DEFAULT_BILLING: BillingSettings = {
  planVersion: PLAN_VERSION,
  monthlyCents: 37900,
  setupFeeCents: 9900,
  phoneFeeCents: 1100,
  includedEmails: 1000,
  includedTexts: 1000,
  extraEmailCents: 10,
  extraTextCents: 5,
  taxRatePercent: 0, // Auto One Motors is sales-tax exempt (certificate on file)
  taxablePercent: 80,
  dueDay: 9,
  emailRange: "100 to 400",
  textRange: "0 to 500",
  billedBy: "High Level Technologies",
  documents: [],
  planParts: [
    { label: "Auto One Motors software, updates and support", detail: "The whole AutoDash system, kept up to date, with support and all your connections maintained", cents: 15900 },
    { label: "AI email replies", detail: "The AI reads each new lead and writes a reply", cents: 6900 },
    { label: "AI texting and call forwarding", detail: "The AI answers customer texts, and calls to the texting number ring the dealership", cents: 6900 },
    { label: "AI training", detail: "Keeping the AI up to date with your hours, inventory questions and answers", cents: 2900 },
    { label: "AI follow-up, hosting, database and backups", detail: "Follow-ups, keeping AutoDash online and fast, and storing your data safely, all in one", cents: 5300 },
  ],
};

export const partsTotal = (parts: BillingSettings["planParts"]) => parts.reduce((n, p) => n + p.cents, 0);

export type InvoiceItem = { label: string; detail?: string; cents: number };
export type Invoice = {
  id: number; period: string; number: string; items: InvoiceItem[]; subtotal: number; tax: number; total: number;
  status: "open" | "processing" | "paid" | "void"; dueDate: string; paidAt: number | null; createdAt: number;
  /** How it was paid ("card" or "bank"), and a short note like "Collecting from the bank on Oct 9". */
  method: string | null; note: string | null;
  /** Set when the bill lives in Stripe (Stripe mode): its own payment page. */
  hostedUrl?: string | null;
  source?: "stripe";
  /** The Stripe invoice id (in_...), used to open our own receipt page. */
  stripeId?: string;
};

export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Adds up a bill: subtotal, tax on the taxable share, total. Kept here so it can be unit tested. */
export function totals(items: InvoiceItem[], s: Pick<BillingSettings, "taxRatePercent" | "taxablePercent">) {
  const subtotal = items.reduce((n, i) => n + i.cents, 0);
  const tax = Math.round(subtotal * (s.taxablePercent / 100) * (s.taxRatePercent / 100));
  return { subtotal, tax, total: subtotal + tax };
}

/** An unpaid bill, brought in line with the current plan: the monthly-plan line gets today's price and the tax is
 *  recalculated. Returns null if nothing changes. Extra-usage lines and the connection fee are left alone. */
export function repricedBill(
  bill: { items: InvoiceItem[]; subtotal: number; tax: number; total: number },
  planLabel: string,
  s: Pick<BillingSettings, "monthlyCents" | "taxRatePercent" | "taxablePercent">,
): { items: InvoiceItem[]; subtotal: number; tax: number; total: number } | null {
  const items = bill.items.map((i) => (i.label === planLabel ? { ...i, cents: s.monthlyCents } : i));
  const t = totals(items, s);
  return t.subtotal === bill.subtotal && t.tax === bill.tax && t.total === bill.total ? null : { items, ...t };
}
