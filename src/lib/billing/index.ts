// AutoDash's own monthly bills: settings, usage, creating a bill each month, and marking it paid.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";
import { DEFAULT_BILLING, periodLabel, totals, type BillingSettings, type Invoice, type InvoiceItem } from "./types";

export async function getBillingSettings(): Promise<BillingSettings> {
  try {
    const raw = await getSetting("billing");
    return raw ? { ...DEFAULT_BILLING, ...JSON.parse(raw) } : DEFAULT_BILLING;
  } catch {
    return DEFAULT_BILLING;
  }
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function saveBillingSettings(input: BillingSettings) {
  const d = DEFAULT_BILLING;
  const clean: BillingSettings = {
    monthlyCents: int(input.monthlyCents, 0, 10_000_000, d.monthlyCents),
    setupFeeCents: int(input.setupFeeCents, 0, 10_000_000, d.setupFeeCents),
    includedEmails: int(input.includedEmails, 0, 1_000_000, d.includedEmails),
    includedTexts: int(input.includedTexts, 0, 1_000_000, d.includedTexts),
    extraEmailCents: int(input.extraEmailCents, 0, 10_000, d.extraEmailCents),
    extraTextCents: int(input.extraTextCents, 0, 10_000, d.extraTextCents),
    taxRatePercent: num(input.taxRatePercent, 0, 30, d.taxRatePercent),
    taxablePercent: num(input.taxablePercent, 0, 100, d.taxablePercent),
    dueDay: int(input.dueDay, 1, 28, d.dueDay),
    planParts: (Array.isArray(input.planParts) ? input.planParts : d.planParts).slice(0, 12)
      .map((p) => ({ label: String(p?.label ?? "").trim().slice(0, 80), detail: String(p?.detail ?? "").trim().slice(0, 160), cents: int(p?.cents, 0, 10_000_000, 0) }))
      .filter((p) => p.label),
    emailRange: String(input.emailRange ?? "").slice(0, 40),
    textRange: String(input.textRange ?? "").slice(0, 40),
    billedBy: String(input.billedBy ?? "").slice(0, 100),
    documents: (Array.isArray(input.documents) ? input.documents : []).slice(0, 20)
      .map((doc) => ({ title: String(doc?.title ?? "").trim().slice(0, 100), url: String(doc?.url ?? "").trim().slice(0, 500) }))
      .filter((doc) => doc.title && /^https:\/\//.test(doc.url)),
  };
  await setSetting("billing", JSON.stringify(clean));
}

/** "2026-10" for the month a moment falls in, Dallas time. */
export const periodOf = (at: Date | number = Date.now()) => dayKey(at, dealership.timeZone).slice(0, 7);
function previousPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function periodRange(period: string) {
  const start = zonedToUtc(`${period}-01`, "00:00", dealership.timeZone)!;
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start, end: zonedToUtc(`${next}-01`, "00:00", dealership.timeZone)! };
}

/** AI emails sent and texts sent in a month (texts come later). */
export async function usageFor(period: string): Promise<{ emails: number; texts: number }> {
  const sql = await readyDb();
  if (!sql) return { emails: 0, texts: 0 };
  const { start, end } = periodRange(period);
  const [[row], [texts]] = await Promise.all([
    sql`select count(*)::int as n from ai_replies where status = 'sent' and sent_at >= ${start} and sent_at < ${end}`,
    sql`select count(*)::int as n from sms_messages where ai and direction = 'out' and status in ('sent', 'delivered', 'queued') and sent_at >= ${start} and sent_at < ${end}`,
  ]);
  return { emails: row.n, texts: texts.n };
}

const toInvoice = (r: Record<string, unknown>): Invoice => ({
  id: Number(r.id), period: r.period as string, number: r.number as string, items: r.items as InvoiceItem[],
  subtotal: r.subtotal as number, tax: r.tax as number, total: r.total as number, status: r.status as Invoice["status"],
  dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10),
  paidAt: r.paid_at ? new Date(r.paid_at as string).getTime() : null, createdAt: new Date(r.created_at as string).getTime(),
});

/** What a month's bill would be: the plan (billed at the start of the month), the setup fee on the very first
 *  bill, and anything over the included emails/texts from the month before. */
export async function draftItems(period: string, s: BillingSettings): Promise<InvoiceItem[]> {
  const sql = await readyDb();
  const covers = s.planParts.map((p) => p.label.split(",")[0]).join(", ");
  const items: InvoiceItem[] = [{ label: "AutoDash monthly plan", detail: `${periodLabel(period)}. ${covers ? `Covers ${covers}. ` : ""}Includes up to ${s.includedEmails.toLocaleString()} AI emails and ${s.includedTexts.toLocaleString()} AI texts.`, cents: s.monthlyCents }];
  const [{ n }] = sql ? await sql`select count(*)::int as n from billing_invoices where status <> 'void'` : [{ n: 0 }];
  if (n === 0 && s.setupFeeCents > 0) items.push({ label: "One-time setup fee", detail: "Setup, Gmail connection and AI training. First bill only.", cents: s.setupFeeCents });
  const prev = previousPeriod(period);
  const used = await usageFor(prev);
  const extraEmails = Math.max(0, used.emails - s.includedEmails);
  const extraTexts = Math.max(0, used.texts - s.includedTexts);
  if (extraEmails) items.push({ label: "Extra AI emails", detail: `${extraEmails.toLocaleString()} over the included ${s.includedEmails.toLocaleString()} in ${periodLabel(prev)}`, cents: extraEmails * s.extraEmailCents });
  if (extraTexts) items.push({ label: "Extra AI texts", detail: `${extraTexts.toLocaleString()} over the included ${s.includedTexts.toLocaleString()} in ${periodLabel(prev)}`, cents: extraTexts * s.extraTextCents });
  return items;
}

/** Creates this month's bill if it doesn't exist yet. The developer's button makes the first bill; after that the
 *  timer makes each new month's bill automatically (onlyIfStarted), so billing never starts by surprise. */
export async function ensureInvoice(period = periodOf(), { onlyIfStarted = false } = {}): Promise<Invoice | null> {
  const sql = await readyDb();
  if (!sql) return null;
  if (onlyIfStarted) {
    const [started] = await sql`select 1 from billing_invoices limit 1`;
    if (!started) return null;
  }
  const [existing] = await sql`select * from billing_invoices where period = ${period}`;
  if (existing) return toInvoice(existing);
  const s = await getBillingSettings();
  const items = await draftItems(period, s);
  const t = totals(items, s);
  // Due on the plan's due day, but never sooner than 10 days after the bill is made (e.g. a bill made late in a month).
  const today = dayKey(Date.now(), dealership.timeZone);
  const dueDay = `${period}-${String(s.dueDay).padStart(2, "0")}`;
  const earliest = addDays(today, 10);
  const due = dueDay > earliest ? dueDay : earliest;
  const [row] = await sql`
    insert into billing_invoices (period, number, items, subtotal, tax, total, due_date)
    values (${period}, ${`AD-${period.replace("-", "")}`}, ${sql.json(items)}, ${t.subtotal}, ${t.tax}, ${t.total}, ${due})
    on conflict (period) do nothing returning *`;
  return row ? toInvoice(row) : ensureInvoice(period);
}

export async function listInvoices(): Promise<Invoice[]> {
  const sql = await readyDb();
  if (!sql) return [];
  return (await sql`select * from billing_invoices where status <> 'void' order by period desc limit 36`).map(toInvoice);
}

export async function getInvoice(id: number): Promise<Invoice | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [row] = await sql`select * from billing_invoices where id = ${id}`;
  return row ? toInvoice(row) : null;
}

export async function setCheckoutSession(id: number, sessionId: string) {
  const sql = await readyDb();
  if (sql) await sql`update billing_invoices set stripe_session_id = ${sessionId} where id = ${id} and status = 'open'`;
}

/** Marks a bill paid once Stripe confirms the payment. Safe to call more than once. */
export async function markPaid(id: number, sessionId: string): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  const rows = await sql`update billing_invoices set status = 'paid', paid_at = now(), stripe_session_id = ${sessionId}
    where id = ${id} and status = 'open' returning id`;
  return rows.length > 0;
}

/** Throws away an unpaid bill so it's recreated with the current prices (developer only). */
export async function voidInvoice(id: number): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  const rows = await sql`update billing_invoices set status = 'void', period = period || '-void-' || id where id = ${id} and status = 'open' returning id`;
  return rows.length > 0;
}

export function isOverdue(invoice: Invoice): boolean {
  return invoice.status === "open" && invoice.dueDate < dayKey(Date.now(), dealership.timeZone);
}

