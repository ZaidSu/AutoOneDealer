// AutoDash's own monthly bills: settings, usage, creating a bill each month, and marking it paid.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";
import { listStripeInvoices, stripeBillingOn, stripeCard } from "./stripe-sync";
import { DEFAULT_BILLING, PHONE_FEE_LABEL, PLAN_VERSION, SETUP_FEE_LABEL, periodLabel, repricedBill, totals, type BillingSettings, type Invoice, type InvoiceItem } from "./types";

export async function getBillingSettings(): Promise<BillingSettings> {
  try {
    const raw = await getSetting("billing");
    if (!raw) return DEFAULT_BILLING;
    const saved = JSON.parse(raw);
    // Saved settings from before the current plan (v2: $379 a month, no sales tax) are brought up to date once. After
    // that the developer's own edits in the form are kept.
    if (Number(saved.planVersion ?? 1) < PLAN_VERSION) {
      const migrated: BillingSettings = { ...DEFAULT_BILLING, ...saved, monthlyCents: DEFAULT_BILLING.monthlyCents, taxRatePercent: 0,
        planParts: DEFAULT_BILLING.planParts, planVersion: PLAN_VERSION };
      await setSetting("billing", JSON.stringify(migrated)).catch(() => undefined);
      return migrated;
    }
    return { ...DEFAULT_BILLING, ...saved };
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
    planVersion: PLAN_VERSION,
    monthlyCents: int(input.monthlyCents, 0, 10_000_000, d.monthlyCents),
    setupFeeCents: int(input.setupFeeCents, 0, 10_000_000, d.setupFeeCents),
    phoneFeeCents: int(input.phoneFeeCents, 0, 10_000_000, d.phoneFeeCents),
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

/** Why there's no bill yet, in plain words (shown on the Billing page instead of failing quietly). */
export function billingStartProblem(period = periodOf()): string | null {
  const raw = process.env.BILLING_START;
  if (raw === undefined || raw === "") return "BILLING_START isn't set in Vercel (or Vercel hasn't redeployed since it was added).";
  const start = raw.trim().replace(/^["']|["']$/g, "");
  if (!/^\d{4}-\d{2}$/.test(start)) return `BILLING_START is "${raw}", but it should look like 2026-10 (year, dash, two-digit month, no quotes or spaces).`;
  if (period < start) return `Billing starts in ${start}; this month is ${period}.`;
  return null;
}

/** Billing starts on its own from the month in BILLING_START (like "2026-10"), so no one has to press a button. */
export function billingStarted(period = periodOf()): boolean {
  const start = String(process.env.BILLING_START ?? "").trim().replace(/^["']|["']$/g, "");
  return /^\d{4}-\d{2}$/.test(start) && period >= start;
}

/** "2026-10" for the month a moment falls in, Dallas time. */
export const periodOf = (at: Date | number = Date.now()) => dayKey(at, dealership.timeZone).slice(0, 7);
export function previousPeriod(period: string) {
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
  method: (r.payment_method as string) ?? null, note: (r.payment_note as string) ?? null,
});

/** What a month's bill would be: the plan (billed at the start of the month), the setup fee on the very first
 *  bill, and anything over the included emails/texts from the month before. */
export async function draftItems(period: string, s: BillingSettings): Promise<InvoiceItem[]> {
  const sql = await readyDb();
  const items: InvoiceItem[] = [{
    label: `${dealership.name} monthly plan`,
    detail: `${periodLabel(period)}. Covers software for ${dealership.name}, AI email replies, AI texting, appointment setting, hosting, database and backups. Up to ${s.includedEmails.toLocaleString()} emails and ${s.includedTexts.toLocaleString()} texts a month.`,
    cents: s.monthlyCents,
  }];
  const [{ n }] = sql ? await sql`select count(*)::int as n from billing_invoices where status <> 'void'` : [{ n: 0 }];
  if (n === 0 && s.setupFeeCents > 0) items.push({ label: SETUP_FEE_LABEL, detail: "Phone number, Gmail and AI connection and training. First bill only.", cents: s.setupFeeCents });
  if (n === 0 && s.phoneFeeCents > 0) items.push({ label: PHONE_FEE_LABEL, detail: "Your dedicated AI texting phone number. First bill only.", cents: s.phoneFeeCents });
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
  // Stripe mode: bills are made by Stripe; AutoDash never creates one. This just finds the month's bill.
  if (stripeBillingOn()) return (await listStripeInvoices().catch(() => [])).find((b) => b.period === period) ?? null;
  const sql = await readyDb();
  if (!sql) return null;
  if (onlyIfStarted && !billingStarted(period)) {
    const [started] = await sql`select 1 from billing_invoices limit 1`;
    if (!started) return null;
  }
  const [existing] = await sql`select * from billing_invoices where period = ${period}`;
  if (existing) {
    // An unpaid bill made before a price or tax change gets the current plan, so nobody is charged the old amount.
    if (existing.status === "open" && (await repriceOpenInvoices().catch(() => 0)) > 0) {
      const [updated] = await sql`select * from billing_invoices where id = ${existing.id}`;
      return toInvoice(updated);
    }
    return toInvoice(existing);
  }
  const s = await getBillingSettings();
  const items = await draftItems(period, s);
  const t = totals(items, s);
  // Always due on the plan's due day (the 9th) of the bill's month. Only if a bill is made after that day already
  // passed (rare: billing started mid-month) is it due on that day of the next month instead, never "past due" at birth.
  const today = dayKey(Date.now(), dealership.timeZone);
  const day = String(s.dueDay).padStart(2, "0");
  const thisMonth = `${period}-${day}`;
  const [y, m] = period.split("-").map(Number);
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${day}`;
  const due = thisMonth >= today ? thisMonth : nextMonth;
  const [row] = await sql`
    insert into billing_invoices (period, number, items, subtotal, tax, total, due_date)
    values (${period}, ${`AD-${period.replace("-", "")}`}, ${sql.json(items)}, ${t.subtotal}, ${t.tax}, ${t.total}, ${due})
    on conflict (period) do nothing returning *`;
  return row ? toInvoice(row) : ensureInvoice(period);
}

/** Unpaid bills for this month or later follow the current plan (price and tax). Bills already paid, being paid, or from
 *  earlier months are never touched. Returns how many bills changed. */
export async function repriceOpenInvoices(): Promise<number> {
  if (stripeBillingOn()) return 0;
  const sql = await readyDb();
  if (!sql) return 0;
  const s = await getBillingSettings();
  const rows = await sql`select * from billing_invoices where status = 'open' and period >= ${periodOf()}`;
  const [{ first }] = await sql`select min(id)::int as first from billing_invoices where status <> 'void'`;
  let changed = 0;
  for (const row of rows) {
    const bill = toInvoice(row);
    const next = repricedBill(bill, `${dealership.name} monthly plan`, s, bill.id === first);
    if (!next) continue;
    await sql`update billing_invoices set items = ${sql.json(next.items)}, subtotal = ${next.subtotal}, tax = ${next.tax}, total = ${next.total}
      where id = ${bill.id} and status = 'open'`;
    changed++;
  }
  if (changed) console.log(`[autodash:billing] updated ${changed} unpaid bill(s) to the current plan`);
  return changed;
}

export async function listInvoices(): Promise<Invoice[]> {
  if (stripeBillingOn()) return listStripeInvoices().catch((e) => { console.error("[autodash:billing] Stripe invoices:", e instanceof Error ? e.message : e); return []; });
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
  const rows = await sql`update billing_invoices set status = 'paid', paid_at = now(), stripe_session_id = ${sessionId}, payment_method = 'card', payment_note = null
    where id = ${id} and status = 'open' returning id`;
  return rows.length > 0;
}

// ---- Bank payments (GoCardless) ----

export async function getBankMandate(): Promise<string | null> {
  return (await getSetting("gc_mandate").catch(() => null)) || null;
}
export async function setBankMandate(id: string | null) {
  await setSetting("gc_mandate", id ?? "");
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Starts collecting one open bill from the connected bank account, on its due date (or the earliest date the bank
 *  allows, if that's later). The bill shows "Processing" until the bank confirms the money arrived. */
export async function collectFromBank(invoice: Invoice): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = await readyDb();
  const mandate = await getBankMandate();
  if (!sql || !mandate) return { ok: false, error: "No bank account is connected." };
  if (invoice.status !== "open") return { ok: false, error: "This bill isn't waiting for payment." };
  const { collectPayment, getMandate } = await import("./gocardless");
  try {
    const m = await getMandate(mandate);
    if (["cancelled", "failed", "expired", "consumed", "blocked"].includes(m.status)) {
      await setBankMandate(null);
      return { ok: false, error: "The bank connection was canceled. Connect the bank account again." };
    }
    const earliest = m.next_possible_charge_date;
    const chargeDate = earliest && invoice.dueDate < earliest ? null : invoice.dueDate;
    const [{ gc_attempts: attempts }] = await sql`select gc_attempts from billing_invoices where id = ${invoice.id}`;
    const payment = await collectPayment({
      mandateId: mandate, cents: invoice.total, invoiceId: invoice.id, chargeDate,
      description: `AutoDash ${invoice.number} (${periodLabel(invoice.period)})${attempts ? ` retry ${attempts}` : ""}`,
      attempt: attempts,
    });
    await sql`update billing_invoices set status = 'processing', gc_payment_id = ${payment.id}, payment_method = 'bank',
      payment_note = ${`Collecting from the bank on ${shortDate(payment.chargeDate)}`} where id = ${invoice.id} and status = 'open'`;
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GoCardless couldn't start the payment.";
    await sql`update billing_invoices set payment_note = ${`Bank payment couldn't start: ${message}`.slice(0, 300)} where id = ${invoice.id}`;
    return { ok: false, error: message };
  }
}

/** Collects every open bill once a bank account is connected (called after setup and each day by the timer). */
export async function collectOpenBills(): Promise<number> {
  if (stripeBillingOn()) return 0;
  if (!(await getBankMandate())) return 0;
  let started = 0;
  for (const invoice of (await listInvoices()).filter((i) => i.status === "open").reverse()) {
    if ((await collectFromBank(invoice)).ok) started++;
  }
  return started;
}

/** Updates from GoCardless: payments confirmed or failed, bank connections canceled. */
export async function handleBankEvent(event: { resource_type: string; action: string; links?: Record<string, string>; details?: { description?: string; cause?: string } }) {
  const sql = await readyDb();
  if (!sql) return;
  if (event.resource_type === "payments" && event.links?.payment) {
    const id = event.links.payment;
    if (event.action === "confirmed" || event.action === "paid_out") {
      await sql`update billing_invoices set status = 'paid', paid_at = coalesce(paid_at, now()), payment_note = null where gc_payment_id = ${id} and status in ('processing', 'open')`;
    } else if (["failed", "cancelled", "charged_back", "late_failure_settled"].includes(event.action)) {
      const why = event.details?.description ?? event.action.replace(/_/g, " ");
      await sql`update billing_invoices set status = 'open', paid_at = null, gc_payment_id = null, gc_attempts = gc_attempts + 1,
        payment_note = ${`Bank payment didn't go through: ${why}`.slice(0, 300)} where gc_payment_id = ${id}`;
    }
  }
  if (event.resource_type === "mandates" && event.links?.mandate && ["cancelled", "failed", "expired", "blocked"].includes(event.action)) {
    if ((await getBankMandate()) === event.links.mandate) await setBankMandate(null);
  }
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


// ---- Card autopay (Stripe) ----

export type CardAutopay = { customer: string; paymentMethod: string; brand: string; last4: string; since: number };
export async function getCardAutopay(): Promise<CardAutopay | null> {
  if (stripeBillingOn()) return stripeCard();
  try { const raw = await getSetting("stripe_autopay"); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function setCardAutopay(value: CardAutopay | null) {
  await setSetting("stripe_autopay", value ? JSON.stringify(value) : "");
}

/** After a card payment: marks the bill paid and, if they chose autopay, remembers the card for the next bills. */
export async function completeCardCheckout(sessionId: string): Promise<"paid" | "pending"> {
  const { getCheckout } = await import("./stripe");
  const session = await getCheckout(sessionId);
  const invoiceId = Number(session.metadata?.invoice_id);
  if (session.payment_status !== "paid" || !invoiceId) return "pending";
  await markPaid(invoiceId, session.id);
  const pi = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const pm = pi && typeof pi.payment_method === "object" ? pi.payment_method : null;
  if (session.metadata?.autopay === "1" && session.customer && pm?.id) {
    await setCardAutopay({ customer: session.customer, paymentMethod: pm.id, brand: pm.card?.brand ?? "card", last4: pm.card?.last4 ?? "", since: Date.now() });
  }
  return "paid";
}

/** Charges the saved card for every unpaid bill that's due today or earlier (the timer runs this daily). */
export async function chargeDueBillsByCard(): Promise<number> {
  if (stripeBillingOn()) return 0; // Stripe charges the card itself
  const sql = await readyDb();
  const autopay = await getCardAutopay();
  if (!sql || !autopay) return 0;
  await repriceOpenInvoices().catch(() => 0); // never charge a card the old amount or old tax
  const { chargeSavedCard } = await import("./stripe");
  const today = dayKey(Date.now(), dealership.timeZone);
  let paid = 0;
  for (const invoice of (await listInvoices()).filter((i) => i.status === "open" && i.dueDate <= today)) {
    const [{ gc_attempts: attempts }] = await sql`select gc_attempts from billing_invoices where id = ${invoice.id}`;
    if (attempts >= 3) continue; // stop retrying after 3 declines; the owner pays by hand or updates the card
    try {
      const pi = await chargeSavedCard({ customer: autopay.customer, paymentMethod: autopay.paymentMethod, cents: invoice.total, invoiceId: invoice.id, attempt: attempts,
        description: `AutoDash ${invoice.number} (${periodLabel(invoice.period)}) autopay` });
      if (pi.status === "succeeded") {
        await sql`update billing_invoices set status = 'paid', paid_at = now(), payment_method = 'card', payment_note = 'Paid automatically (autopay)' where id = ${invoice.id} and status = 'open'`;
        paid++;
      } else {
        await sql`update billing_invoices set gc_attempts = gc_attempts + 1, payment_note = ${`Autopay didn't go through (${pi.status}). Pay by hand below.`} where id = ${invoice.id}`;
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : "the card was declined";
      await sql`update billing_invoices set gc_attempts = gc_attempts + 1, payment_note = ${`Autopay didn't go through: ${why}`.slice(0, 300)} where id = ${invoice.id}`;
    }
  }
  return paid;
}

/** How a bill looks: green when nothing's needed, yellow when due within a week, red when past due. */
export type BillTone = { tone: "green" | "yellow" | "red"; label: string; detail: string; lockOn: string | null };
export function billTone(invoice: Invoice, autopay: boolean): BillTone {
  const today = dayKey(Date.now(), dealership.timeZone);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (invoice.status === "paid") return { tone: "green", label: "Paid", detail: invoice.paidAt ? `Paid ${new Date(invoice.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: dealership.timeZone })}` : "Paid", lockOn: null };
  if (invoice.status === "processing") return { tone: "green", label: "Processing", detail: invoice.note ?? "Payment is processing", lockOn: null };
  const daysLeft = Math.round((Date.parse(invoice.dueDate) - Date.parse(today)) / 86400000);
  if (daysLeft < 0) {
    const lock = addDays(invoice.dueDate, 3);
    return { tone: "red", label: "Past due", detail: `Was due ${fmt(invoice.dueDate)}`, lockOn: lock };
  }
  if (autopay && !invoice.note) return { tone: "green", label: "Autopay", detail: `Enrolled in autopay. Charged automatically on ${fmt(invoice.dueDate)}`, lockOn: null };
  if (daysLeft <= 7) return { tone: "yellow", label: daysLeft === 0 ? "Due today" : "Due soon", detail: `Due ${fmt(invoice.dueDate)}${daysLeft ? ` (in ${daysLeft} day${daysLeft === 1 ? "" : "s"})` : ""}`, lockOn: null };
  return { tone: "green", label: "Due", detail: `Due ${fmt(invoice.dueDate)}`, lockOn: null };
}
