// One-time conversion from the old model (separate purchases, sales and invoices) to the new one (an invoice holds its items).
// Used by the database upgrade and by preview mode's browser storage. Pure, so it's unit tested (npm test).
import type { Customer, DocKind, Invoice, InvoiceLine, Item, TaxStatus } from "./types.ts";

export type OldPurchase = { id: string; item_id: string; contractor_id: string | null; qty: number; unit_cost: number; purchased_on: string; store: string | null; miles: number };
export type OldSale = {
  id: string; item_id: string; customer_id: string | null; qty: number; unit_price: number; sold_on: string; tax_status: TaxStatus; sales_tax: number;
  invoice_no: string | null; invoice_id: string | null; purchase_id: string | null; unit_cost: number | null;
};
export type OldInvoice = {
  id: string; kind: DocKind; invoice_no: string; customer_id: string | null; invoice_date: string; status: "unpaid" | "paid"; paid_on: string | null; file_id: string | null; notes: string | null;
};
export type LegacyInput = { items: Item[]; customers: Customer[]; invoices: OldInvoice[]; purchases: OldPurchase[]; sales: OldSale[] };

export type LegacyResult = {
  /** Every invoice, old and new, with the new fields filled in. */
  invoices: Invoice[];
  /** Ids of invoices created for sales that were never on an invoice. */
  generated: string[];
  lines: InvoiceLine[];
  /** Items bought but never sold. They have no invoice to live on, so they aren't carried over. */
  unsold: number;
};

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function legacyToNew(old: LegacyInput, uuid: () => string = () => crypto.randomUUID()): LegacyResult {
  const purchase = new Map(old.purchases.map((p) => [p.id, p]));
  const invoiceById = new Map(old.invoices.map((i) => [i.id, i]));
  const invoiceByNo = new Map(old.invoices.map((i) => [norm(i.invoice_no), i]));

  // What an item cost on average, for sales that never knew which purchase they came from.
  const spent = new Map<string, { qty: number; total: number }>();
  for (const p of old.purchases) { const s = spent.get(p.item_id) ?? { qty: 0, total: 0 }; s.qty += p.qty; s.total += p.qty * Number(p.unit_cost); spent.set(p.item_id, s); }
  const avgCost = (itemId: string) => { const s = spent.get(itemId); return s && s.qty ? s.total / s.qty : 0; };

  // Group the sales by the invoice they were on. Sales on no invoice are grouped by customer and day.
  const groups = new Map<string, { invoice: OldInvoice | null; customer: string | null; day: string; sales: OldSale[] }>();
  for (const s of old.sales) {
    const inv = (s.invoice_id ? invoiceById.get(s.invoice_id) : undefined) ?? (s.invoice_no ? invoiceByNo.get(norm(s.invoice_no)) : undefined);
    const k = inv ? `inv|${inv.id}` : `loose|${s.customer_id ?? ""}|${s.sold_on}`;
    const g = groups.get(k) ?? { invoice: inv ?? null, customer: s.customer_id, day: s.sold_on, sales: [] };
    g.sales.push(s);
    groups.set(k, g);
  }
  for (const i of old.invoices) if (!groups.has(`inv|${i.id}`)) groups.set(`inv|${i.id}`, { invoice: i, customer: i.customer_id, day: i.invoice_date, sales: [] });

  // Oldest first, so a trip's miles land on the earliest invoice that used that purchase.
  const ordered = [...groups.values()].sort((a, b) => (a.invoice?.invoice_date ?? a.day).localeCompare(b.invoice?.invoice_date ?? b.day));
  const milesTaken = new Set<string>();
  const invoices: Invoice[] = [];
  const lines: InvoiceLine[] = [];
  const generated: string[] = [];

  for (const g of ordered) {
    const base: OldInvoice = g.invoice ?? {
      id: uuid(), kind: "invoice", invoice_no: `Imported ${g.day}`, customer_id: g.customer, invoice_date: g.day, status: "paid", paid_on: g.day, file_id: null,
      notes: "Imported from your old Sales list. It wasn't on an invoice, so it's marked paid and doesn't count as money owed.",
    };
    if (!g.invoice) generated.push(base.id);

    const bought = g.sales.map((s) => (s.purchase_id ? purchase.get(s.purchase_id) : undefined));
    let miles = 0;
    for (const p of bought) if (p && !milesTaken.has(p.id)) { milesTaken.add(p.id); miles += Number(p.miles) || 0; }

    const stores = new Map<string, number>();
    for (const p of bought) if (p?.store?.trim()) stores.set(p.store.trim(), (stores.get(p.store.trim()) ?? 0) + 1);
    const store = [...stores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const workers = new Set(bought.filter((p): p is OldPurchase => Boolean(p)).map((p) => p.contractor_id));
    const onlyWorker = workers.size === 1 && !workers.has(null) ? [...workers][0] : null;
    const mixed = [...workers].some((w) => w !== null) && onlyWorker === null;

    const taxable = g.sales.some((s) => s.tax_status === "taxable");
    const taxStatus: TaxStatus = taxable ? "taxable" : g.sales[0]?.tax_status ?? "resale";
    const notes = [base.notes, mixed ? "Imported: some of these were bought by a contractor. Check \"Bought by\" and set it if you owe them." : null].filter(Boolean).join(" ") || null;

    invoices.push({
      ...base, notes, contractor_id: onlyWorker, store, miles: Math.round(miles * 10) / 10, tax_status: taxStatus,
      sales_tax: taxable ? round2(g.sales.reduce((a, s) => a + (Number(s.sales_tax) || 0), 0)) : 0, total_override: null, cost_override: null, their_card: null, my_card: null,
    });
    g.sales.forEach((s, position) => {
      const p = s.purchase_id ? purchase.get(s.purchase_id) : undefined;
      const cost = s.unit_cost !== null && s.unit_cost !== undefined ? Number(s.unit_cost) : p ? Number(p.unit_cost) : avgCost(s.item_id);
      lines.push({ id: uuid(), invoice_id: base.id, item_id: s.item_id, qty: s.qty, unit_price: Number(s.unit_price), unit_cost: round2(cost), position });
    });
  }

  const soldPurchases = new Set(old.sales.map((s) => s.purchase_id).filter(Boolean));
  return { invoices, generated, lines, unsold: old.purchases.filter((p) => !soldPurchases.has(p.id)).length };
}
