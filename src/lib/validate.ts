// Reads and checks form values. Pure functions with no server-only imports, so the real database (server actions)
// and preview mode (saved in the browser) follow exactly the same rules. Unit tested (npm test).
import { round2 } from "./calc.ts";

export type Parsed<T> = { ok: true; v: T } | { ok: false; error: string };
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });
const good = <T,>(v: T): Parsed<T> => ({ ok: true, v });

type Raw = FormDataEntryValue | null | undefined;
type Form = { get(name: string): Raw };

export const TAX_STATUSES = ["resale", "exempt", "taxable"] as const;
export const BUSINESSES = ["resale", "software", "shared"] as const;
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel allows about 4.5 MB per request
export const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];

export const text = (v: Raw, max = 120): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};
export const amount = (v: Raw): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? round2(n) : null;
};
export const whole = (v: Raw): number | null => {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 && n < 1e7 ? n : null;
};
export const day = (v: Raw): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};
export const id = (v: Raw): string | null => (typeof v === "string" && /^[\w-]{8,64}$/.test(v) ? v : null);

/** Returns what's wrong with an uploaded file, or null if it's fine (or if no file was chosen). */
export function fileProblem(value: Raw): string | null {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (value.size > MAX_FILE_BYTES) return "That file is over 4 MB. Try a smaller PDF or photo.";
  if (!FILE_TYPES.includes(value.type)) return "Upload a PDF, PNG, JPG, WebP or GIF file.";
  return null;
}

/** Business miles: blank means 0. Returns null when it isn't a sensible number. */
export const milesOf = (v: Raw): number | null => {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? Math.round(n * 10) / 10 : null;
};

/** A full UPC becomes its last 4 digits ("012345678912" -> "8912"); 4 digits or fewer, or any other text, is kept as typed. */
export function last4(v: Raw): string | null {
  const t = text(v, 40);
  if (!t) return null;
  const digits = t.replace(/[\s-]/g, "");
  if (/^\d+$/.test(digits)) return digits.length > 4 ? digits.slice(-4) : digits;
  return t.slice(0, 12);
}

export function parseItem(fd: Form): Parsed<{ name: string; upc: string | null; sku: string | null; category: string | null }> {
  const name = text(fd.get("name"), 120);
  if (!name) return bad("Enter the item's name.");
  return good({ name, upc: last4(fd.get("upc")), sku: text(fd.get("sku"), 40), category: text(fd.get("category"), 60) });
}

export function parseItemUpdate(fd: Form) {
  const itemId = id(fd.get("item_id"));
  if (!itemId) return bad("Unknown item.");
  const p = parseItem(fd);
  return p.ok ? good({ itemId, ...p.v }) : p;
}

export type LineInput = { name: string; upc: string | null; qty: number; price: number; cost: number; ownCard: boolean };
export const MAX_LINES = 200;

export type InvoiceInput = {
  id: string | null; kind: "invoice" | "po"; no: string; customerId: string | null; newCustomerName: string | null; date: string; status: "paid" | "unpaid"; paidOn: string | null; notes: string | null;
  contractorId: string | null; store: string | null; miles: number; taxStatus: string; salesTax: number;
  totalOverride: number | null; costOverride: number | null; theirCard: number | null; myCard: string | null; lines: LineInput[];
};

/** Reads an item row typed or read from a PDF. `n` is the row number (for the message). */
function parseLine(raw: unknown, n: number): Parsed<LineInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = text(typeof r.name === "string" ? r.name : "", 120);
  if (!name) return bad(`Item ${n}: enter a name.`);
  const qty = whole(String(r.qty ?? ""));
  if (!qty) return bad(`Item ${n} (${name}): enter a quantity of 1 or more.`);
  const price = amount(String(r.price ?? ""));
  if (price === null) return bad(`Item ${n} (${name}): enter the price each.`);
  const rawCost = String(r.cost ?? "").trim();
  const cost = rawCost === "" ? 0 : amount(rawCost);
  if (cost === null) return bad(`Item ${n} (${name}): enter the cost each, or leave it blank.`);
  return good({ name, upc: last4(typeof r.upc === "string" ? r.upc : null), qty, price, cost, ownCard: r.own_card !== false });
}

/**
 * An invoice or purchase order with all of its items, from the invoice form (new, edited, or read from a PDF).
 * Tax only counts when the invoice is taxable. The items arrive as JSON in the "lines" field.
 */
export function parseInvoiceSave(fd: Form): Parsed<InvoiceInput> {
  const kind = fd.get("kind") === "po" ? "po" : "invoice";
  const no = text(fd.get("invoice_no"), 60), date = day(fd.get("invoice_date"));
  const rawId = fd.get("invoice_id");
  const invoiceId = rawId ? id(rawId) : null;
  if (rawId && !invoiceId) return bad("Unknown invoice.");
  if (!no) return bad(kind === "po" ? "Enter the PO number." : "Enter the invoice number.");
  if (!date) return bad(kind === "po" ? "Pick the PO date." : "Pick the invoice date.");
  const rawCustomer = fd.get("customer_id");
  const customerId = rawCustomer ? id(rawCustomer) : null;
  const newCustomerName = text(fd.get("new_customer_name"), 80);
  if (rawCustomer && !customerId) return bad("Unknown customer.");
  if (!customerId && !newCustomerName) return bad("Choose the customer.");
  const rawWorker = fd.get("contractor_id");
  const contractorId = rawWorker ? id(rawWorker) : null;
  if (rawWorker && !contractorId) return bad("Unknown contractor.");
  const miles = milesOf(fd.get("miles"));
  if (miles === null) return bad("Enter the business miles as a number, or leave it blank.");
  const taxStatus = String(fd.get("tax_status") ?? "resale");
  if (!(TAX_STATUSES as readonly string[]).includes(taxStatus)) return bad("Choose how this invoice is taxed.");
  const rawTax = String(fd.get("sales_tax") ?? "").trim();
  const salesTax = taxStatus !== "taxable" || rawTax === "" ? 0 : amount(rawTax);
  if (salesTax === null) return bad("Enter the sales tax as a dollar amount, or leave it blank.");
  const optional = (name: string, label: string): Parsed<number | null> => {
    const v = String(fd.get(name) ?? "").trim();
    if (v === "") return good(null);
    const n = amount(v);
    return n === null ? bad(`Enter ${label} as a dollar amount, or leave it blank.`) : good(n);
  };
  const total = optional("total_override", "the total they owe"); if (!total.ok) return total;
  const cost = optional("cost_override", "the cost of goods"); if (!cost.ok) return cost;
  const theirCard = optional("their_card", "the amount spent on their card"); if (!theirCard.ok) return theirCard;

  let rawLines: unknown;
  try { rawLines = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { return bad("Couldn't read the items. Try again."); }
  if (!Array.isArray(rawLines)) return bad("Couldn't read the items. Try again.");
  if (rawLines.length > MAX_LINES) return bad(`An invoice can have up to ${MAX_LINES} items.`);
  const lines: LineInput[] = [];
  for (const [i, raw] of rawLines.entries()) {
    const p = parseLine(raw, i + 1);
    if (!p.ok) return p;
    lines.push(p.v);
  }
  if (lines.length === 0 && total.v === null) return bad("Add at least one item, or type in the total they owe you.");

  return good({
    id: invoiceId, kind, no, customerId, newCustomerName: customerId ? null : newCustomerName, date, status: fd.get("status") === "paid" ? "paid" : "unpaid", paidOn: day(fd.get("paid_on")), notes: text(fd.get("notes"), 200),
    contractorId, store: text(fd.get("store"), 60), miles, taxStatus, salesTax, totalOverride: total.v, costOverride: cost.v, theirCard: theirCard.v, myCard: text(fd.get("my_card"), 60), lines,
  });
}

export function parseExpense(fd: Form) {
  const date = day(fd.get("spent_on")), category = text(fd.get("category"), 60), total = amount(fd.get("amount"));
  if (!date) return bad("Pick the date.");
  if (!category) return bad("Choose a category.");
  if (total === null) return bad("Enter the amount.");
  const business = String(fd.get("business") ?? "resale");
  if (!(BUSINESSES as readonly string[]).includes(business)) return bad("Choose which part of the company this is for.");
  return good({ date, category, total, business, vendor: text(fd.get("vendor"), 80), notes: text(fd.get("notes"), 200) });
}

export function parseContractor(fd: Form) {
  const name = text(fd.get("name"), 80);
  if (!name) return bad("Enter the contractor's name.");
  return good({ name, phone: text(fd.get("phone"), 30), email: text(fd.get("email"), 120), notes: text(fd.get("notes"), 200) });
}

export function parsePayment(fd: Form) {
  const contractorId = id(fd.get("contractor_id")), total = amount(fd.get("amount")), date = day(fd.get("paid_on"));
  if (!contractorId) return bad("Unknown contractor.");
  if (!total || total <= 0) return bad("Enter an amount above $0.");
  if (!date) return bad("Pick the payment date.");
  return good({ contractorId, total, date, method: text(fd.get("method"), 40), reference: text(fd.get("reference"), 60), notes: text(fd.get("notes"), 200) });
}

export function parseCustomer(fd: Form) {
  const name = text(fd.get("name"), 80), status = String(fd.get("default_tax_status") ?? "");
  if (!name) return bad("Enter the customer's name.");
  if (!(TAX_STATUSES as readonly string[]).includes(status)) return bad("Choose how their sales are usually taxed.");
  return good({ name, status, notes: text(fd.get("notes"), 200) });
}

/** The mileage rate for one year, in dollars per mile (like 0.655). */
export function parseMileageRate(fd: Form) {
  const year = Number(fd.get("year")), rate = Number(fd.get("rate"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return bad("Unknown year.");
  if (!Number.isFinite(rate) || rate <= 0 || rate > 5) return bad("Enter the rate in dollars per mile, like 0.70.");
  return good({ year, rate: Math.round(rate * 10000) / 10000 });
}

/** Which quarter to finalize or reopen. */
export function parseQuarter(fd: Form) {
  const year = Number(fd.get("year")), quarter = Number(fd.get("quarter"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return bad("Unknown year.");
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return bad("Unknown quarter.");
  return good({ year, quarter, note: text(fd.get("note"), 300) });
}

// ---- Software side: projects and income ----
export const PROJECT_STATUSES = ["active", "paused", "done"] as const;

/** A project, new or edited (edited when project_id is present). */
export function parseProject(fd: Form) {
  const name = text(fd.get("name"), 80);
  if (!name) return bad("Enter the project name.");
  const rawId = fd.get("project_id");
  const projectId = rawId ? id(rawId) : null;
  if (rawId && !projectId) return bad("Unknown project.");
  const status = String(fd.get("status") ?? "active");
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) return bad("Choose the project's status.");
  return good({ projectId, name, client: text(fd.get("client"), 80), status: status as (typeof PROJECT_STATUSES)[number], notes: text(fd.get("notes"), 200) });
}

/** Money received, new or edited (edited when income_id is present). */
export function parseIncome(fd: Form) {
  const date = day(fd.get("received_on")), source = text(fd.get("source"), 80), total = amount(fd.get("amount"));
  if (!date) return bad("Pick the date you were paid.");
  if (!source) return bad("Enter where the money came from.");
  if (!total || total <= 0) return bad("Enter an amount above $0.");
  const rawId = fd.get("income_id");
  const incomeId = rawId ? id(rawId) : null;
  if (rawId && !incomeId) return bad("Unknown income entry.");
  const rawProject = fd.get("project_id");
  const projectId = rawProject ? id(rawProject) : null;
  if (rawProject && !projectId) return bad("Unknown project.");
  return good({ incomeId, date, source, total, projectId, notes: text(fd.get("notes"), 200) });
}

export type ContractorLineInput = { name: string; upc: string | null; qty: number; buy: number; sell: number };
export type ContractorInvoiceInput = { id: string | null; contractorId: string; date: string; ref: string | null; notes: string | null; lines: ContractorLineInput[] };

/**
 * An invoice from a contractor to you: the items arrive as JSON in "lines", each with what they paid (buy) and what they charge you (sell).
 */
export function parseContractorInvoice(fd: Form): Parsed<ContractorInvoiceInput> {
  const contractorId = id(fd.get("contractor_id")), date = day(fd.get("invoiced_on"));
  const rawId = fd.get("invoice_id"), invoiceId = rawId ? id(rawId) : null;
  if (rawId && !invoiceId) return bad("Unknown invoice.");
  if (!contractorId) return bad("Unknown contractor.");
  if (!date) return bad("Pick the date.");
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { return bad("Couldn't read the items. Try again."); }
  if (!Array.isArray(raw)) return bad("Couldn't read the items. Try again.");
  if (raw.length > MAX_LINES) return bad(`An invoice can have up to ${MAX_LINES} items.`);
  const lines: ContractorLineInput[] = [];
  for (const [k, r0] of raw.entries()) {
    const r = (r0 ?? {}) as Record<string, unknown>;
    const name = text(typeof r.name === "string" ? r.name : "", 120);
    if (!name) return bad(`Item ${k + 1}: enter a name.`);
    const qty = whole(String(r.qty ?? ""));
    if (!qty) return bad(`Item ${k + 1} (${name}): enter a quantity of 1 or more.`);
    const rawBuy = String(r.buy ?? "").trim(), buy = rawBuy === "" ? 0 : amount(rawBuy);
    if (buy === null) return bad(`Item ${k + 1} (${name}): enter what they paid each, or leave it blank.`);
    const sell = amount(String(r.sell ?? ""));
    if (sell === null) return bad(`Item ${k + 1} (${name}): enter what they charge you each.`);
    lines.push({ name, upc: last4(typeof r.upc === "string" ? r.upc : null), qty, buy, sell });
  }
  if (lines.length === 0) return bad("Add at least one item.");
  return good({ id: invoiceId, contractorId, date, ref: text(fd.get("ref"), 60), notes: text(fd.get("notes"), 200), lines });
}
