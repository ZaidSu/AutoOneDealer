// Billing shapes and the plan defaults. No database code, so browser components can import it.
export type BillingSettings = {
  monthlyCents: number;
  setupFeeCents: number;
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
  monthlyCents: 36900,
  setupFeeCents: 8000,
  includedEmails: 1000,
  includedTexts: 1000,
  extraEmailCents: 10,
  extraTextCents: 5,
  taxRatePercent: 8.25,
  taxablePercent: 80,
  dueDay: 9,
  emailRange: "100 to 400",
  textRange: "0 to 500",
  billedBy: "Marketplace Wholesale LLC",
  documents: [],
  planParts: [
    { label: "AutoDash software, updates and support", detail: "Dashboard, leads, customers, pipeline, appointments, analytics, fixes and new features", cents: 14900 },
    { label: "AI email replies", detail: "The AI reads each new lead and writes a reply for your team to approve", cents: 7900 },
    { label: "AI texting", detail: "The AI texts customers and answers their texts (turning on soon)", cents: 5300 },
    { label: "Hosting", detail: "Keeping AutoDash online, fast and secure around the clock", cents: 4900 },
    { label: "Database and backups", detail: "Storing your leads, customers and appointments safely", cents: 3900 },
  ],
};

export const partsTotal = (parts: BillingSettings["planParts"]) => parts.reduce((n, p) => n + p.cents, 0);

export type InvoiceItem = { label: string; detail?: string; cents: number };
export type Invoice = {
  id: number; period: string; number: string; items: InvoiceItem[]; subtotal: number; tax: number; total: number;
  status: "open" | "paid" | "void"; dueDate: string; paidAt: number | null; createdAt: number;
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
