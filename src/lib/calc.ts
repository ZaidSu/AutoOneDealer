// All the money math. Pure functions, no imports, so it can be unit tested directly (npm test).
// The model is simple: an invoice holds its items. What they owe you, your cost of goods and your profit are worked out
// from the invoice, and everything else (dashboard, taxes, quarters) is built from invoices.
import type { Contractor, ContractorInvoice, ContractorInvoiceLine, Data, Expense, Invoice, InvoiceLine, Item, Payment, QuarterRecord, QuarterSnapshot, Settings } from "./types.ts";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Default sales tax rate (%) offered when an invoice is taxable. It can be changed on every invoice.
export const DEFAULT_TAX_RATE = 8.25;
/** Business miles filled in on every new invoice (the usual trip). Change it here, or type another number on the invoice. */
export const DEFAULT_MILES = 17.5;

// Mileage rate ($ per mile) used when none is saved for a year. 0.655 is what your sheet works out to ($11.14 for 17 miles);
// confirm the rate for each year with your accountant and change it on the Taxes page.
export const DEFAULT_MILEAGE_RATE = 0.655;
export const rateFor = (settings: Settings | undefined, year: number): number => settings?.mileageRates?.[String(year)] ?? DEFAULT_MILEAGE_RATE;

export const TAX_LABEL: Record<string, string> = { resale: "Resale", exempt: "Exempt", taxable: "Taxable" };

export const QUARTERS = [
  { label: "Q1", months: "Jan–Mar", from: "01-01", to: "03-31" },
  { label: "Q2", months: "Apr–Jun", from: "04-01", to: "06-30" },
  { label: "Q3", months: "Jul–Sep", from: "07-01", to: "09-30" },
  { label: "Q4", months: "Oct–Dec", from: "10-01", to: "12-31" },
];

export const money = (n: number | string | null | undefined): string =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** A mileage rate shown with its third decimal when it needs one: 0.655 stays $0.655, 0.7 becomes $0.70. */
export const perMile = (r: number): string => `$${r.toFixed(3).endsWith("0") ? r.toFixed(2) : r.toFixed(3)}`;

export const num = (n: number | string | null | undefined): string => (Number(n) || 0).toLocaleString("en-US");

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** 2026-07-08 shown the way your sheet writes it: 7/8/2026. */
export const sheetDate = (d: string): string => { const [y, m, day] = d.split("-"); return `${Number(m)}/${Number(day)}/${y}`; };

export const yearOf = (d: string): number => Number(String(d).slice(0, 4));
export const monthOf = (d: string): number => Number(String(d).slice(5, 7)) - 1;

/** Today's date in Dallas, as YYYY-MM-DD (the server runs in UTC, so don't use the server's own date). */
export function todayCentral(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

// ---------------------------------------------------------------------------------------------------------------
// One invoice: what they owe you, what the goods cost, what's left
// ---------------------------------------------------------------------------------------------------------------

export type InvoiceTotals = {
  /** The items on it, in order. */
  lines: InvoiceLine[];
  count: number; units: number;
  /** The items added up (price x quantity), before tax. */
  subtotal: number;
  tax: number;
  /** What they owe you: the total you typed in, or the items plus tax. */
  owed: number;
  /** What you sold, before tax. */
  gross: number;
  /** Cost of goods: the cost you typed in, or each item's cost added up. */
  cogs: number;
  /** Gross minus cost of goods. */
  profit: number;
  /** Cost of the items bought with the customer's own card: they paid the store directly, so it is not part of what they owe you. */
  theirCard: number;
  /** Cost of goods paid for on your own card(s): cost of goods minus what went on theirs. */
  myCard: number;
  miles: number;
  /** When a total was typed in and the items don't add up to it, by how much (otherwise 0). */
  gap: number;
};

/** The numbers on an invoice, from its items and its own settings. Used for saved invoices and for the form as you type. */
export function totalsOf(
  inv: Pick<Invoice, "tax_status" | "sales_tax" | "total_override" | "cost_override" | "miles"> & { their_card?: number | null },
  lines: { qty: number; unit_price: number; unit_cost: number; own_card?: boolean }[],
): Omit<InvoiceTotals, "lines"> {
  let sub = 0, cost = 0, units = 0, theirs = 0;
  for (const l of lines) { sub += l.qty * l.unit_price; cost += l.qty * l.unit_cost; units += l.qty; if (l.own_card === false) theirs += l.qty * l.unit_cost; }
  // An amount typed for "spent on their card" wins over what the items' card choices add up to.
  if (inv.their_card !== null && inv.their_card !== undefined) theirs = Number(inv.their_card) || 0;
  const tax = inv.tax_status === "taxable" ? Number(inv.sales_tax) || 0 : 0;
  const typedTotal = inv.total_override !== null && inv.total_override !== undefined;
  // Items bought on the customer's card were already paid by them, so they owe you the rest: your profit on those items.
  const owed = typedTotal ? Number(inv.total_override) : sub + tax - theirs;
  const cogs = inv.cost_override !== null && inv.cost_override !== undefined ? Number(inv.cost_override) : cost;
  const gross = typedTotal ? owed - tax : sub;
  return {
    count: lines.length, units, subtotal: round2(sub), tax: round2(tax), owed: round2(owed), gross: round2(gross), cogs: round2(cogs),
    profit: round2(gross - cogs), theirCard: round2(theirs), myCard: round2(Math.max(0, cogs - theirs)), miles: Number(inv.miles) || 0, gap: typedTotal && lines.length > 0 ? round2(owed - (sub + tax - theirs)) : 0,
  };
}

/** Each invoice's items, in order. */
export function linesByInvoice(lines: InvoiceLine[]): Map<string, InvoiceLine[]> {
  const map = new Map<string, InvoiceLine[]>();
  for (const l of lines) map.set(l.invoice_id, [...(map.get(l.invoice_id) ?? []), l]);
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

/** The totals for every invoice at once. */
export function invoiceTotalsMap(invoices: Invoice[], lines: InvoiceLine[]): Map<string, InvoiceTotals> {
  const by = linesByInvoice(lines);
  return new Map(invoices.map((i) => { const mine = by.get(i.id) ?? []; return [i.id, { lines: mine, ...totalsOf(i, mine) }]; }));
}

export function invoiceTotals(inv: Invoice, lines: InvoiceLine[]): InvoiceTotals {
  const mine = lines.filter((l) => l.invoice_id === inv.id).sort((a, b) => a.position - b.position);
  return { lines: mine, ...totalsOf(inv, mine) };
}

/** The names of your cards used on invoices so far, for suggestions while typing. */
export function cardNames(invoices: Pick<Invoice, "my_card">[]): string[] {
  return [...new Set(invoices.map((i) => (i.my_card ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** What the goods cost, split by whose card paid: the customer's, and each of yours. Invoices with no card named are grouped together. */
export function cardSpend(invoices: Invoice[], lines: InvoiceLine[]): { theirs: number; mine: { name: string; spent: number; invoices: number }[] } {
  const t = invoiceTotalsMap(invoices, lines);
  let theirs = 0;
  const by = new Map<string, { spent: number; invoices: number }>();
  for (const i of invoices) {
    const x = t.get(i.id)!;
    theirs += x.theirCard;
    if (x.myCard <= 0) continue;
    const name = (i.my_card ?? "").trim() || "No card named";
    const cur = by.get(name) ?? { spent: 0, invoices: 0 };
    by.set(name, { spent: cur.spent + x.myCard, invoices: cur.invoices + 1 });
  }
  const mine = [...by.entries()].map(([name, v]) => ({ name, spent: round2(v.spent), invoices: v.invoices }))
    .sort((a, b) => (a.name === "No card named" ? 1 : b.name === "No card named" ? -1 : b.spent - a.spent));
  return { theirs: round2(theirs), mine };
}

/** Money customers still owe you = what's on invoices not yet paid. */
export function unpaidTotal(invoices: Invoice[], lines: InvoiceLine[]): number {
  const t = invoiceTotalsMap(invoices, lines);
  return round2(invoices.filter((i) => i.status !== "paid").reduce((a, i) => a + (t.get(i.id)?.owed ?? 0), 0));
}

// ---------------------------------------------------------------------------------------------------------------
// Items: how each one has done across all invoices
// ---------------------------------------------------------------------------------------------------------------

export type ItemStat = { invoices: number; sold: number; revenue: number; cost: number; profit: number; avgPrice: number; avgCost: number; lastPrice: number; lastCost: number; lastDate: string };

export function itemStats(items: Item[], invoices: Invoice[], lines: InvoiceLine[]): Record<string, ItemStat> {
  const date = new Map(invoices.map((i) => [i.id, i.invoice_date]));
  const map: Record<string, ItemStat & { _inv: Set<string> }> = {};
  for (const it of items) map[it.id] = { invoices: 0, sold: 0, revenue: 0, cost: 0, profit: 0, avgPrice: 0, avgCost: 0, lastPrice: 0, lastCost: 0, lastDate: "", _inv: new Set() };
  for (const l of lines) {
    const s = map[l.item_id], d = date.get(l.invoice_id);
    if (!s || !d) continue;
    s.sold += l.qty; s.revenue += l.qty * l.unit_price; s.cost += l.qty * l.unit_cost; s._inv.add(l.invoice_id);
    if (d >= s.lastDate) { s.lastDate = d; s.lastPrice = l.unit_price; s.lastCost = l.unit_cost; }
  }
  const out: Record<string, ItemStat> = {};
  for (const [id, s] of Object.entries(map)) {
    const { _inv, ...rest } = s;
    out[id] = { ...rest, invoices: _inv.size, revenue: round2(s.revenue), cost: round2(s.cost), profit: round2(s.revenue - s.cost), avgPrice: s.sold ? round2(s.revenue / s.sold) : 0, avgCost: s.sold ? round2(s.cost / s.sold) : 0 };
  }
  return out;
}

/** What each item last sold for and cost, so a new line can start from last time. */
export function lastPrices(items: Item[], invoices: Invoice[], lines: InvoiceLine[]): Record<string, { price: number; cost: number }> {
  const stats = itemStats(items, invoices, lines);
  const out: Record<string, { price: number; cost: number }> = {};
  for (const it of items) if (stats[it.id].lastDate) out[it.id] = { price: stats[it.id].lastPrice, cost: stats[it.id].lastCost };
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Contractors: people who pay for goods out of their own pocket
// ---------------------------------------------------------------------------------------------------------------

/** `bought` is what contractors have billed you for items (what you owe them), `spent` what they paid for those items, `profit` the difference (theirs). */
export type Balance = { bought: number; paid: number; owed: number; orders: number; spent: number; profit: number };

export type ContractorInvoiceTotals = { units: number; spent: number; billed: number; profit: number };

/** One contractor invoice: what they paid, what they charge you, and what they make on it. Never part of your own totals. */
export function contractorInvoiceTotals(lines: ContractorInvoiceLine[]): ContractorInvoiceTotals {
  let units = 0, spent = 0, billed = 0;
  for (const l of lines) { units += l.qty; spent += l.qty * l.buy_price; billed += l.qty * l.sell_price; }
  return { units, spent: round2(spent), billed: round2(billed), profit: round2(billed - spent) };
}

/** A contractor's invoices, newest first, each with its items and totals. */
export function contractorInvoiceList(contractorId: string, invoices: ContractorInvoice[], lines: ContractorInvoiceLine[]) {
  return invoices.filter((i) => i.contractor_id === contractorId).sort((a, b) => b.invoiced_on.localeCompare(a.invoiced_on))
    .map((invoice) => {
      const mine = lines.filter((l) => l.invoice_id === invoice.id).sort((a, b) => a.position - b.position);
      return { invoice, lines: mine, ...contractorInvoiceTotals(mine) };
    });
}

/**
 * What each contractor has billed you (their own invoices to you, plus any older invoice of yours still marked "bought by" them),
 * what you've paid back, and what you still owe.
 */
export function contractorBalances(
  contractors: Contractor[], invoices: Invoice[], lines: InvoiceLine[], payments: Payment[],
  contractorInvoices: ContractorInvoice[] = [], contractorLines: ContractorInvoiceLine[] = [],
): Record<string, Balance> {
  const map: Record<string, Balance> = {};
  for (const c of contractors) map[c.id] = { bought: 0, paid: 0, owed: 0, orders: 0, spent: 0, profit: 0 };
  for (const c of contractors) for (const x of contractorInvoiceList(c.id, contractorInvoices, contractorLines)) {
    const b = map[c.id]; b.bought += x.billed; b.spent += x.spent; b.profit += x.profit; b.orders += 1;
  }
  const totals = invoiceTotalsMap(invoices.filter((i) => i.contractor_id), lines);
  for (const inv of invoices) {
    const b = inv.contractor_id ? map[inv.contractor_id] : undefined;
    if (b) { const cogs = totals.get(inv.id)?.cogs ?? 0; b.bought += cogs; b.spent += cogs; b.orders += 1; }
  }
  for (const pay of payments) {
    const b = map[pay.contractor_id];
    if (b) b.paid += Number(pay.amount);
  }
  for (const id of Object.keys(map)) {
    map[id].bought = round2(map[id].bought);
    map[id].spent = round2(map[id].spent);
    map[id].profit = round2(map[id].profit);
    map[id].paid = round2(map[id].paid);
    map[id].owed = round2(map[id].bought - map[id].paid);
  }
  return map;
}

/** Older invoices of yours that were marked as bought by a contractor (before contractors had their own invoices). */
export function legacyContractorInvoices(contractorId: string, invoices: Invoice[], lines: InvoiceLine[]) {
  const mine = invoices.filter((i) => i.contractor_id === contractorId);
  const totals = invoiceTotalsMap(mine, lines);
  return mine.map((invoice) => ({ invoice, ...totals.get(invoice.id)! }));
}

/** One line per contractor invoice or payment to them, with a running balance, for a contractor statement. */
export function contractorLedger(
  contractorId: string, contractorInvoices: ContractorInvoice[], contractorLines: ContractorInvoiceLine[],
  invoices: Invoice[], lines: InvoiceLine[], payments: Payment[],
) {
  const rows = [
    ...contractorInvoiceList(contractorId, contractorInvoices, contractorLines).map((x) => ({
      date: x.invoice.invoiced_on, type: "Invoice from contractor" + (x.invoice.ref ? ` ${x.invoice.ref}` : ""), detail: `${x.units} items`, change: round2(x.billed),
    })),
    ...legacyContractorInvoices(contractorId, invoices, lines).map((x) => ({
      date: x.invoice.invoice_date, type: "Bought for " + docName(x.invoice), detail: `${x.units} items${x.invoice.store ? ` at ${x.invoice.store}` : ""}`, change: round2(x.cogs),
    })),
    ...payments.filter((p) => p.contractor_id === contractorId).map((p) => ({ date: p.paid_on, type: "Payment to contractor", detail: [p.method, p.reference].filter(Boolean).join(" "), change: -round2(Number(p.amount)) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  return rows.map((r) => { run = round2(run + r.change); return { ...r, balance: run }; });
}

// ---------------------------------------------------------------------------------------------------------------
// Totals for a stretch of dates (the Taxes page, quarters, the dashboard)
// ---------------------------------------------------------------------------------------------------------------

export type PeriodSummary = {
  totalSales: number; resaleSales: number; taxableSales: number; taxCollected: number; cogs: number;
  expenses: number; units: number; grossProfit: number; netProfit: number;
  miles: number; mileageExpense: number; netAfterMileage: number;
};

type Books = Pick<Data, "invoices" | "lines" | "expenses">;

/** Totals for a date range (inclusive), by invoice date. */
export function periodSummary(args: Books & { from: string; to: string; mileageRate?: number }): PeriodSummary {
  const { invoices, lines, expenses, from, to, mileageRate = DEFAULT_MILEAGE_RATE } = args;
  const inRange = (d: string) => d >= from && d <= to;
  const totals = invoiceTotalsMap(invoices.filter((i) => inRange(i.invoice_date)), lines);
  const s = { totalSales: 0, resaleSales: 0, taxableSales: 0, taxCollected: 0, cogs: 0, expenses: 0, units: 0, grossProfit: 0, netProfit: 0, miles: 0, mileageExpense: 0, netAfterMileage: 0 };
  for (const inv of invoices.filter((i) => inRange(i.invoice_date))) {
    const t = totals.get(inv.id)!;
    s.totalSales += t.gross;
    if (inv.tax_status === "taxable") s.taxableSales += t.gross; else s.resaleSales += t.gross;
    s.taxCollected += t.tax; s.cogs += t.cogs; s.units += t.units; s.miles += t.miles;
  }
  for (const e of expenses.filter((x) => inRange(x.spent_on))) s.expenses += Number(e.amount);
  s.grossProfit = s.totalSales - s.cogs;
  s.netProfit = s.grossProfit - s.expenses;
  s.mileageExpense = s.miles * mileageRate;
  s.netAfterMileage = s.netProfit - s.mileageExpense;
  for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] = round2(s[k]);
  return s;
}

export type MonthRow = { month: string; Spent: number; Revenue: number; Profit: number; Sold: number };
export type ItemYear = { sold: number; revenue: number; cost: number };
export type YearSummary = {
  months: MonthRow[];
  totals: { spent: number; revenue: number; profit: number; sold: number; tax: number; expenses: number | null; net: number | null };
  perItem: Record<string, ItemYear>;
};

/** A year month by month. With an item chosen it counts just that item's lines; otherwise whole invoices. */
export function yearSummary(args: Books & { year: number; itemId?: string }): YearSummary {
  const { invoices, lines, expenses, year, itemId } = args;
  const months: MonthRow[] = MONTHS.map((m) => ({ month: m, Spent: 0, Revenue: 0, Profit: 0, Sold: 0 }));
  const mine = invoices.filter((i) => yearOf(i.invoice_date) === year);
  const totals = invoiceTotalsMap(mine, lines);
  const perItem: Record<string, ItemYear> = {};
  let tax = 0;
  for (const inv of mine) {
    const t = totals.get(inv.id)!;
    const m = months[monthOf(inv.invoice_date)];
    for (const l of t.lines) {
      const r = (perItem[l.item_id] ||= { sold: 0, revenue: 0, cost: 0 });
      r.sold += l.qty; r.revenue += l.qty * l.unit_price; r.cost += l.qty * l.unit_cost;
    }
    if (itemId) {
      const only = t.lines.filter((l) => l.item_id === itemId);
      const rev = only.reduce((a, l) => a + l.qty * l.unit_price, 0), cost = only.reduce((a, l) => a + l.qty * l.unit_cost, 0);
      m.Revenue += rev; m.Spent += cost; m.Profit += rev - cost; m.Sold += only.reduce((a, l) => a + l.qty, 0);
    } else {
      m.Revenue += t.gross; m.Spent += t.cogs; m.Profit += t.profit; m.Sold += t.units; tax += t.tax;
    }
  }
  for (const m of months) { m.Spent = round2(m.Spent); m.Revenue = round2(m.Revenue); m.Profit = round2(m.Profit); }
  const sum = months.reduce((a, m) => ({ spent: a.spent + m.Spent, revenue: a.revenue + m.Revenue, profit: a.profit + m.Profit, sold: a.sold + m.Sold }), { spent: 0, revenue: 0, profit: 0, sold: 0 });
  // Expenses aren't tied to one item, so they only count when you're viewing all items.
  const exp = itemId ? null : round2(expenses.filter((e) => yearOf(e.spent_on) === year).reduce((a, e) => a + Number(e.amount), 0));
  const profit = round2(sum.profit);
  return {
    months, perItem,
    totals: { spent: round2(sum.spent), revenue: round2(sum.revenue), profit, sold: sum.sold, tax: round2(tax), expenses: exp, net: exp === null ? null : round2(profit - exp) },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Trips: miles belong to an invoice, so one trip is counted once
// ---------------------------------------------------------------------------------------------------------------

/** Invoices that list miles on the same day for the same store: probably one trip counted more than once. */
export function repeatedTrips(invoices: Invoice[]): { date: string; store: string; count: number; miles: number }[] {
  const groups = new Map<string, Invoice[]>();
  for (const i of invoices) if (Number(i.miles) > 0) { const k = `${i.invoice_date}|${norm(i.store)}`; groups.set(k, [...(groups.get(k) ?? []), i]); }
  return [...groups.values()].filter((g) => g.length > 1)
    .map((g) => ({ date: g[0].invoice_date, store: g[0].store ?? "", count: g.length, miles: round2(g.reduce((a, i) => a + Number(i.miles), 0)) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Every item sold, one row each (the "spreadsheet" view used by downloads and the Items pages)
// ---------------------------------------------------------------------------------------------------------------

export type ItemRow = {
  key: string; invoiceId: string; docLabel: string; date: string; customerId: string | null; store: string; itemId: string; itemName: string; upc: string;
  qty: number; priceEach: number; costEach: number; sales: number; cost: number; profit: number; paid: boolean;
};

/** One row per item per invoice, newest invoice first. */
export function itemRows(d: Pick<Data, "items" | "invoices" | "lines">): ItemRow[] {
  const item = new Map(d.items.map((i) => [i.id, i]));
  const by = linesByInvoice(d.lines);
  const rows: ItemRow[] = [];
  for (const inv of d.invoices) {
    for (const l of by.get(inv.id) ?? []) {
      const it = item.get(l.item_id);
      rows.push({
        key: l.id, invoiceId: inv.id, docLabel: docShort(inv), date: inv.invoice_date, customerId: inv.customer_id, store: inv.store ?? "", itemId: l.item_id, itemName: it?.name ?? "Unknown", upc: it?.upc ?? "",
        qty: l.qty, priceEach: l.unit_price, costEach: l.unit_cost, sales: round2(l.qty * l.unit_price), cost: round2(l.qty * l.unit_cost), profit: round2(l.qty * (l.unit_price - l.unit_cost)), paid: inv.status === "paid",
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------------------------------------------
// Per month / quarter / year, and the numbers behind the Analytics page.
// ---------------------------------------------------------------------------------------------------------------

export type PeriodRow = { label: string; kind: "month" | "quarter" | "year"; invoices: number; units: number; gross: number; cogs: number; profit: number; miles: number; mileageExpense: number };

/** Every month of a year, with a subtotal after each quarter and a total for the year. */
export function periodTable(args: Pick<Data, "invoices" | "lines"> & { year: number; mileageRate?: number }): PeriodRow[] {
  const { invoices, lines, year, mileageRate } = args;
  const sum = (from: string, to: string) => periodSummary({ invoices, lines, expenses: [], from, to, mileageRate });
  const row = (label: string, kind: PeriodRow["kind"], from: string, to: string): PeriodRow => {
    const x = sum(from, to);
    return { label, kind, invoices: invoices.filter((i) => i.invoice_date >= from && i.invoice_date <= to).length, units: x.units, gross: x.totalSales, cogs: x.cogs, profit: x.grossProfit, miles: x.miles, mileageExpense: x.mileageExpense };
  };
  const out: PeriodRow[] = [];
  for (let m = 0; m < 12; m++) {
    const mm = String(m + 1).padStart(2, "0");
    const last = new Date(year, m + 1, 0).getDate();
    out.push(row(MONTHS[m], "month", `${year}-${mm}-01`, `${year}-${mm}-${last}`));
    if (m % 3 === 2) { const q = QUARTERS[Math.floor(m / 3)]; out.push(row(q.label, "quarter", `${year}-${q.from}`, `${year}-${q.to}`)); }
  }
  out.push(row(String(year), "year", `${year}-01-01`, `${year}-12-31`));
  return out;
}

export type MonthPoint = { key: string; label: string; gross: number; cogs: number; net: number };

/** Sales, cost of goods and net profit for each month (by invoice date). A year gives 12 months; null gives every month with activity. */
export function monthlySales(d: Pick<Data, "invoices" | "lines">, year: number | null): MonthPoint[] {
  const totals = invoiceTotalsMap(d.invoices, d.lines);
  const acc = new Map<string, MonthPoint>();
  const keyOf = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const make = (y: number, m: number): MonthPoint => ({ key: keyOf(y, m), label: year === null ? `${MONTHS[m]} ${String(y).slice(2)}` : MONTHS[m], gross: 0, cogs: 0, net: 0 });
  if (year !== null) for (let m = 0; m < 12; m++) acc.set(keyOf(year, m), make(year, m));
  for (const inv of d.invoices) {
    if (year !== null && yearOf(inv.invoice_date) !== year) continue;
    const t = totals.get(inv.id)!;
    const y = yearOf(inv.invoice_date), m = monthOf(inv.invoice_date), k = keyOf(y, m);
    const pt = acc.get(k) ?? make(y, m);
    pt.gross += t.gross; pt.cogs += t.cogs; pt.net += t.profit;
    acc.set(k, pt);
  }
  let list = [...acc.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (year === null && list.length > 1) {
    // fill the gaps so a quiet month shows as zero instead of being skipped
    const [fy, fm] = list[0].key.split("-").map(Number), [ly, lm] = list[list.length - 1].key.split("-").map(Number);
    list = [];
    for (let y = fy, m = fm - 1; y < ly || (y === ly && m <= lm - 1); m++) { if (m > 11) { m = 0; y++; } list.push(acc.get(keyOf(y, m)) ?? make(y, m)); }
  }
  return list.map((p) => ({ ...p, gross: round2(p.gross), cogs: round2(p.cogs), net: round2(p.net) }));
}

export type PricePoint = { date: string; price: number; qty: number; note: string };

/** What an item cost and what it sold for, invoice by invoice, oldest first. */
export function priceHistory(d: Pick<Data, "invoices" | "lines">, itemId: string): { buy: PricePoint[]; sell: PricePoint[] } {
  const inv = new Map(d.invoices.map((i) => [i.id, i]));
  const byDate = (a: PricePoint, b: PricePoint) => a.date.localeCompare(b.date);
  const mine = d.lines.filter((l) => l.item_id === itemId && inv.has(l.invoice_id));
  const buy = mine.filter((l) => l.unit_cost > 0).map((l) => ({ date: inv.get(l.invoice_id)!.invoice_date, price: l.unit_cost, qty: l.qty, note: inv.get(l.invoice_id)!.store ?? "" })).sort(byDate);
  const sell = mine.map((l) => ({ date: inv.get(l.invoice_id)!.invoice_date, price: l.unit_price, qty: l.qty, note: docName(inv.get(l.invoice_id)!) })).sort(byDate);
  return { buy, sell };
}

export type ItemPerf = { itemId: string; name: string; units: number; gross: number; cogs: number; net: number; avgBuy: number; avgSell: number; margin: number };

/** How each item did: units, sales, cost, profit, and average prices (by invoice date). */
export function itemPerformance(d: Pick<Data, "items" | "invoices" | "lines">, year: number | null): ItemPerf[] {
  const rows = itemRows(d).filter((r) => year === null || yearOf(r.date) === year);
  const acc = new Map<string, ItemPerf>();
  for (const r of rows) {
    const p = acc.get(r.itemId) ?? { itemId: r.itemId, name: r.itemName, units: 0, gross: 0, cogs: 0, net: 0, avgBuy: 0, avgSell: 0, margin: 0 };
    p.units += r.qty; p.gross += r.sales; p.cogs += r.cost; p.net += r.profit;
    acc.set(r.itemId, p);
  }
  return [...acc.values()].map((p) => ({ ...p, gross: round2(p.gross), cogs: round2(p.cogs), net: round2(p.net), avgBuy: round2(p.cogs / p.units), avgSell: round2(p.gross / p.units), margin: p.gross ? round2((p.net / p.gross) * 100) : 0 }))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}

/** What the goods cost at each store (by invoice date), biggest first. */
export function storeSpend(d: Pick<Data, "invoices" | "lines">, year: number | null): { store: string; spent: number }[] {
  const totals = invoiceTotalsMap(d.invoices, d.lines);
  const acc = new Map<string, number>();
  for (const inv of d.invoices) {
    if (year !== null && yearOf(inv.invoice_date) !== year) continue;
    const name = (inv.store ?? "").trim() || "No store";
    acc.set(name, (acc.get(name) ?? 0) + (totals.get(inv.id)?.cogs ?? 0));
  }
  return [...acc.entries()].map(([store, spent]) => ({ store, spent: round2(spent) })).filter((s) => s.spent > 0).sort((a, b) => b.spent - a.spent);
}

/** Expenses split by which part of the company they belong to, for each quarter and the year. */
export function expensesByBusiness(expenses: Expense[], year: number): { business: string; label: string; quarters: number[]; total: number }[] {
  const names: Record<string, string> = { resale: "Electronics resale", software: "Software services", shared: "Shared" };
  return (["resale", "software", "shared"] as const).map((b) => {
    const mine = expenses.filter((e) => (e.business ?? "resale") === b && yearOf(e.spent_on) === year);
    const quarters = QUARTERS.map((q) => round2(mine.filter((e) => e.spent_on >= `${year}-${q.from}` && e.spent_on <= `${year}-${q.to}`).reduce((a, e) => a + Number(e.amount), 0)));
    return { business: b, label: names[b], quarters, total: round2(quarters.reduce((a, c) => a + c, 0)) };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Invoices and purchase orders, by name
// ---------------------------------------------------------------------------------------------------------------

/** "PO 8355" or "Invoice 75", for titles. */
export const docName = (inv: Pick<Invoice, "kind" | "invoice_no">): string => `${inv.kind === "po" ? "PO" : "Invoice"} ${inv.invoice_no}`;
/** "PO 8355" or just "75", for tight spaces like tables. */
export const docShort = (inv: Pick<Invoice, "kind" | "invoice_no">): string => (inv.kind === "po" ? `PO ${inv.invoice_no}` : inv.invoice_no);

// ---------------------------------------------------------------------------------------------------------------
// Quarters: where each one stands, what's in it, and whether it can be locked ("finalized")
// ---------------------------------------------------------------------------------------------------------------

type QRef = { year: number; quarter: number };

export const quarterOf = (date: string): QRef => ({ year: yearOf(date), quarter: Math.floor(monthOf(date) / 3) + 1 });
export const quarterLabel = (year: number, quarter: number): string => `Quarter ${quarter}, ${year}`;
export const quarterBounds = (year: number, quarter: number): { from: string; to: string } => {
  const q = QUARTERS[quarter - 1];
  return { from: `${year}-${q.from}`, to: `${year}-${q.to}` };
};
const dayNumber = (d: string): number => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000);
const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** How many days before a quarter ends the "closing soon" reminder starts. */
export const CLOSING_SOON_DAYS = 14;

export type QuarterState = {
  state: "finalized" | "upcoming" | "open" | "closing" | "ended";
  /** Days until the quarter's last day (0 on the last day). */
  daysLeft: number;
  /** Days since the quarter ended. */
  daysAgo: number;
  /** A quarter can be finalized from its last day onward. */
  canFinalize: boolean;
};

export function quarterState(year: number, quarter: number, today: string, quarters: QRef[] = []): QuarterState {
  const { from, to } = quarterBounds(year, quarter);
  const done = quarters.some((r) => r.year === year && r.quarter === quarter);
  const daysLeft = daysBetween(today, to);
  const base = { daysLeft: Math.max(daysLeft, 0), daysAgo: Math.max(-daysLeft, 0), canFinalize: today >= to };
  if (done) return { ...base, state: "finalized" };
  if (today < from) return { ...base, state: "upcoming" };
  if (today > to) return { ...base, state: "ended" };
  return { ...base, state: daysLeft <= CLOSING_SOON_DAYS ? "closing" : "open" };
}

/** The message to show when something dated in a finalized quarter is being changed, or null when it's fine. */
export function lockedMessage(quarters: QRef[] | undefined, dates: (string | null | undefined)[]): string | null {
  for (const d of dates) {
    if (!d) continue;
    const q = quarterOf(d);
    if ((quarters ?? []).some((r) => r.year === q.year && r.quarter === q.quarter)) return `${quarterLabel(q.year, q.quarter)} is finalized. Reopen it on the Quarters page to change it.`;
  }
  return null;
}

export type QuarterSummary = {
  summary: PeriodSummary; invoices: number; unpaid: number; unpaidOwed: number; itemsSold: number; activity: boolean; snapshot: QuarterSnapshot;
};

/** Everything about one quarter: the money, how many invoices and items, and the numbers to freeze if it's finalized. */
export function quarterSummary(d: Data, year: number, quarter: number): QuarterSummary {
  const { from, to } = quarterBounds(year, quarter);
  const summary = periodSummary({ invoices: d.invoices, lines: d.lines, expenses: d.expenses, from, to, mileageRate: rateFor(d.settings, year) });
  const invs = d.invoices.filter((i) => i.invoice_date >= from && i.invoice_date <= to);
  const totals = invoiceTotalsMap(invs, d.lines);
  const unpaidInvs = invs.filter((i) => i.status !== "paid");
  const activity = invs.length > 0 || summary.expenses > 0;
  return {
    summary, invoices: invs.length, unpaid: unpaidInvs.length, unpaidOwed: round2(unpaidInvs.reduce((a, i) => a + (totals.get(i.id)?.owed ?? 0), 0)), itemsSold: summary.units, activity,
    snapshot: {
      totalSales: summary.totalSales, cogs: summary.cogs, expenses: summary.expenses, netProfit: summary.netProfit, miles: summary.miles, mileageExpense: summary.mileageExpense,
      invoices: invs.length, unpaid: unpaidInvs.length, items: summary.units,
    },
  };
}

export type QuarterCheck = { ok: boolean; text: string; href: string; cta: string };

/** The "before you close it" list for one quarter. */
export function quarterChecks(d: Data, year: number, quarter: number): QuarterCheck[] {
  const { from, to } = quarterBounds(year, quarter);
  const invs = d.invoices.filter((i) => i.invoice_date >= from && i.invoice_date <= to);
  const totals = invoiceTotalsMap(invs, d.lines);
  const unpaid = invs.filter((i) => i.status !== "paid");
  const empty = invs.filter((i) => (totals.get(i.id)?.owed ?? 0) === 0);
  const noCert = invs.filter((i) => i.tax_status === "resale" && !d.customers.find((c) => c.id === i.customer_id)?.cert_file_id);
  const noTax = invs.filter((i) => i.tax_status === "taxable" && !(Number(i.sales_tax) > 0));
  const trips = repeatedTrips(invs);
  const ok = (good: boolean, yes: string, no: string, href: string, cta: string): QuarterCheck => ({ ok: good, text: good ? yes : no, href, cta });
  return [
    ok(unpaid.length === 0, "Every invoice and purchase order is paid.", `${plural(unpaid.length, "invoice")} not paid yet (${money(round2(unpaid.reduce((a, i) => a + (totals.get(i.id)?.owed ?? 0), 0)))}).`, "/invoices", "Open Invoices"),
    ok(empty.length === 0, "Every invoice has items or a total.", `${plural(empty.length, "invoice")} with nothing on it ($0).`, "/invoices", "Open Invoices"),
    ok(noCert.length === 0, "Every resale invoice has a resale certificate on file.", `${plural(noCert.length, "resale invoice")} to a customer with no resale certificate uploaded.`, "/customers", "Open Customers"),
    ok(noTax.length === 0, "Every taxable invoice has tax recorded.", `${plural(noTax.length, "taxable invoice")} with $0 tax collected.`, "/invoices", "Open Invoices"),
    ok(trips.length === 0, "No store trip has its miles counted twice.", `${plural(trips.length, "store trip")} list miles on more than one invoice.`, "/invoices", "Open Invoices"),
  ];
}

export type QuarterBanner = { year: number; quarter: number; kind: "ended" | "closing"; text: string };

/** The reminder to show at the top of the working pages: an ended quarter that isn't finalized yet, or the current one closing soon. */
export function quarterBanner(d: Data, today: string): QuarterBanner | null {
  const quarters = d.quarters ?? [];
  const cur = quarterOf(today);
  // Quarters that already ended, newest first, that have records in them and haven't been finalized.
  const overdue: QRef[] = [];
  for (let y = cur.year, q = cur.quarter - 1, n = 0; n < 8; n++, q--) {
    if (q < 1) { q = 4; y--; }
    if (!quarters.some((r) => r.year === y && r.quarter === q) && quarterSummary(d, y, q).activity) overdue.push({ year: y, quarter: q });
  }
  if (overdue.length) {
    const o = overdue[0];
    const ago = quarterState(o.year, o.quarter, today).daysAgo;
    const more = overdue.length > 1 ? ` (and ${plural(overdue.length - 1, "more quarter")} before it)` : "";
    return { year: o.year, quarter: o.quarter, kind: "ended", text: `${quarterLabel(o.year, o.quarter)} ended ${ago === 1 ? "yesterday" : `${ago} days ago`} and isn't finalized yet${more}.` };
  }
  const st = quarterState(cur.year, cur.quarter, today, quarters);
  if (st.state === "closing" && quarterSummary(d, cur.year, cur.quarter).activity) {
    const when = st.daysLeft === 0 ? "closes today" : st.daysLeft === 1 ? "closes tomorrow" : `closes in ${st.daysLeft} days`;
    return { year: cur.year, quarter: cur.quarter, kind: "closing", text: `${quarterLabel(cur.year, cur.quarter)} ${when} (${sheetDate(quarterBounds(cur.year, cur.quarter).to)}).` };
  }
  return null;
}
