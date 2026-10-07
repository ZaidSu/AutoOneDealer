import assert from "node:assert/strict";
import { test } from "node:test";
import { contractorBalances, contractorInvoiceTotals, contractorLedger, totalsOf } from "../../src/lib/calc.ts";
import { planInvoiceSave } from "../../src/lib/invoice-save.ts";
import { parseContractorInvoice, parseInvoiceSave, last4 } from "../../src/lib/validate.ts";
import { splitUpc } from "../../src/lib/invoice-parse.ts";
import type { Invoice, InvoiceLine, Item } from "../../src/lib/types.ts";

const inv = (o: Partial<Invoice> = {}): Invoice => ({
  id: "i1", kind: "invoice", invoice_no: "1", customer_id: null, invoice_date: "2026-01-05", status: "unpaid", paid_on: null, file_id: null, notes: null,
  contractor_id: null, store: null, miles: 10, tax_status: "resale", sales_tax: 0, total_override: null, cost_override: null, their_card: null, my_card: null, ...o,
});
const line = (qty: number, unit_price: number, unit_cost: number): InvoiceLine => ({ id: "l", invoice_id: "i1", item_id: "x", qty, unit_price, unit_cost, position: 0 });

test("profit = total owed - cost of goods", () => {
  const t = totalsOf(inv(), [line(2, 100, 60), line(1, 50, 30)]);
  assert.equal(t.owed, 250);
  assert.equal(t.cogs, 150);
  assert.equal(t.profit, 100);
});

test("overrides replace the item sums; tax is not profit", () => {
  const t = totalsOf(inv({ total_override: 1000, cost_override: 700 }), [line(1, 1, 1)]);
  assert.equal(t.owed, 1000);
  assert.equal(t.profit, 300);
  const taxed = totalsOf(inv({ tax_status: "taxable", sales_tax: 10 }), [line(1, 100, 60)]);
  assert.equal(taxed.owed, 110);
  assert.equal(taxed.profit, 40);
});

test("planInvoiceSave reuses items by name and fills a missing UPC", () => {
  const items: Item[] = [{ id: "a", name: "Galaxy Buds", upc: null, sku: null, category: null }];
  let n = 0;
  const plan = planInvoiceSave(items, [
    { name: "galaxy  buds", upc: "1234", qty: 1, price: 5, cost: 3 },
    { name: "Pixel", upc: null, qty: 2, price: 9, cost: 4 },
  ], () => `new${++n}`);
  assert.equal(plan.lines[0].item_id, "a");
  assert.deepEqual(plan.upcFills, [{ id: "a", upc: "1234" }]);
  assert.equal(plan.newItems.length, 1);
  assert.equal(plan.lines[1].item_id, "new1");
});

test("last4 and splitUpc", () => {
  assert.equal(last4("0123456789"), "6789");
  assert.equal(last4(""), null);
  assert.equal(splitUpc("Widget 0012345678905").upc.length > 0, true);
});

test("parseInvoiceSave reads lines and zeroes tax unless taxable", () => {
  const fd = new FormData();
  fd.set("invoice_no", "75"); fd.set("new_customer_name", "Wave"); fd.set("invoice_date", "2026-02-01"); fd.set("miles", "12"); fd.set("tax_status", "resale"); fd.set("sales_tax", "9");
  fd.set("lines", JSON.stringify([{ name: "A", upc: "9999", qty: 2, price: 10, cost: 4 }]));
  const r = parseInvoiceSave(fd);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.v.salesTax, 0); assert.equal(r.v.lines[0].qty, 2); assert.equal(r.v.miles, 12); }
  fd.set("lines", JSON.stringify([{ name: "", qty: 1, price: 1 }]));
  assert.equal(parseInvoiceSave(fd).ok, false);
});

test("same last-4 UPC is the same item, even with a different name; no duplicates within one invoice", () => {
  const items: Item[] = [{ id: "a", name: "iPad Silver", upc: "6232", sku: null, category: null }];
  let n = 0;
  const plan = planInvoiceSave(items, [
    { name: "Apple iPad 10th Gen Silver", upc: "6232", qty: 1, price: 5, cost: 3 },
    { name: "Laptop", upc: "5501", qty: 1, price: 5, cost: 3 },
    { name: "Laptop (second line)", upc: "5501", qty: 1, price: 5, cost: 3 },
  ], () => `new${++n}`);
  assert.equal(plan.lines[0].item_id, "a");
  assert.equal(plan.newItems.length, 1);
  assert.equal(plan.lines[1].item_id, plan.lines[2].item_id);
});

import { parseIncome, parseProject } from "../../src/lib/validate.ts";
import { buildExport } from "../../src/lib/exports.ts";

test("parseIncome and parseProject", () => {
  const fd = new FormData();
  fd.set("received_on", "2026-03-01"); fd.set("source", "Acme"); fd.set("amount", "1200.5");
  const r = parseIncome(fd);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.v.total, 1200.5); assert.equal(r.v.projectId, null); assert.equal(r.v.incomeId, null); }
  fd.set("amount", "0"); assert.equal(parseIncome(fd).ok, false);
  fd.set("amount", "5"); fd.set("source", ""); assert.equal(parseIncome(fd).ok, false);
  const p = new FormData(); p.set("name", "Site"); p.set("status", "done");
  const pr = parseProject(p); assert.ok(pr.ok);
  p.set("status", "weird"); assert.equal(parseProject(p).ok, false);
});

test("income export lists project names and respects the year", () => {
  const d = { projects: [{ id: "p", name: "Site", client: null, status: "active", notes: null }],
    income: [{ id: "a", received_on: "2026-02-01", source: "Acme", project_id: "p", amount: 10, notes: null }, { id: "b", received_on: "2025-02-01", source: "Old", project_id: null, amount: 5, notes: null }],
    settings: { mileageRates: {} }, quarters: [], items: [], customers: [], contractors: [], payments: [], invoices: [], lines: [], expenses: [] };
  const out = buildExport("income", d as never, 2026);
  assert.equal(out?.rows.length, 1);
  assert.equal(out?.rows[0].project, "Site");
});

test("parseInvoiceSave keeps the day the payment arrived", () => {
  const fd = new FormData();
  fd.set("invoice_no", "9"); fd.set("new_customer_name", "Wave"); fd.set("invoice_date", "2026-02-01"); fd.set("status", "paid"); fd.set("paid_on", "2026-02-20");
  fd.set("lines", JSON.stringify([{ name: "A", qty: 1, price: 1 }]));
  const r = parseInvoiceSave(fd); assert.ok(r.ok);
  if (r.ok) assert.equal(r.v.paidOn, "2026-02-20");
  fd.delete("paid_on");
  const r2 = parseInvoiceSave(fd); assert.ok(r2.ok);
  if (r2.ok) assert.equal(r2.v.paidOn, null);
});

test("items bought on their card are not owed, but profit stays the same", () => {
  const mine = totalsOf(inv(), [line(2, 100, 60)]);
  const theirs = totalsOf(inv(), [{ ...line(2, 100, 60), own_card: false }]);
  assert.equal(mine.owed, 200);
  assert.equal(theirs.owed, 80);
  assert.equal(theirs.theirCard, 120);
  assert.equal(theirs.gross, 200);
  assert.equal(theirs.profit, mine.profit);
  const mixed = totalsOf(inv(), [line(1, 50, 30), { ...line(1, 50, 30), own_card: false }]);
  assert.equal(mixed.owed, 70);
});

test("parseInvoiceSave keeps which card each item was bought with", () => {
  const fd = new FormData();
  fd.set("invoice_no", "1"); fd.set("new_customer_name", "Wave"); fd.set("invoice_date", "2026-02-01");
  fd.set("lines", JSON.stringify([{ name: "A", qty: 1, price: 1, own_card: false }, { name: "B", qty: 1, price: 1 }]));
  const r = parseInvoiceSave(fd); assert.ok(r.ok);
  if (r.ok) { assert.equal(r.v.lines[0].ownCard, false); assert.equal(r.v.lines[1].ownCard, true); }
});

test("an amount typed for their card replaces the per-item choice; profit does not change", () => {
  const lines = [line(10, 100, 80)]; // sells 1000, costs 800, profit 200
  const base = totalsOf(inv(), lines);
  assert.equal(base.owed, 1000); assert.equal(base.theirCard, 0); assert.equal(base.myCard, 800);
  const mixed = totalsOf(inv({ their_card: 300 }), lines);
  assert.equal(mixed.theirCard, 300); assert.equal(mixed.myCard, 500); assert.equal(mixed.owed, 700); assert.equal(mixed.profit, 200);
  const all = totalsOf(inv({ their_card: 800 }), lines);
  assert.equal(all.owed, 200); assert.equal(all.profit, 200);
  const zero = totalsOf(inv({ their_card: 0 }), [{ ...lines[0], own_card: false }]);
  assert.equal(zero.theirCard, 0); assert.equal(zero.owed, 1000);
});

test("their card amount and my card name are read from the form", () => {
  const fd = new FormData();
  fd.set("invoice_no", "9"); fd.set("invoice_date", "2026-03-01"); fd.set("new_customer_name", "BWWI");
  fd.set("their_card", "300.50"); fd.set("my_card", "  Chase Ink ");
  fd.set("lines", JSON.stringify([{ name: "A", qty: 1, price: 10 }]));
  const p = parseInvoiceSave(fd);
  assert.ok(p.ok); if (p.ok) { assert.equal(p.v.theirCard, 300.5); assert.equal(p.v.myCard, "Chase Ink"); }
  fd.set("their_card", "abc");
  assert.equal(parseInvoiceSave(fd).ok, false);
  fd.set("their_card", "");
  const blank = parseInvoiceSave(fd); assert.ok(blank.ok); if (blank.ok) assert.equal(blank.v.theirCard, null);
});

const J = "11111111-1111-4111-8111-111111111111";
const cinv = (id: string, on: string) => ({ id, contractor_id: J, invoiced_on: on, ref: null, notes: null });
const cline = (invoice_id: string, qty: number, buy_price: number, sell_price: number, position = 0) => ({ id: invoice_id + position, invoice_id, name: "Airpods", upc: null, qty, buy_price, sell_price, position });

test("a contractor invoice: she paid 79, charges 83, so she makes 4 each; you owe what she charges", () => {
  const t = contractorInvoiceTotals([cline("a", 10, 79, 83)]);
  assert.deepEqual(t, { units: 10, spent: 790, billed: 830, profit: 40 });
});

test("contractor balances come from their invoices and payments, and never touch your own totals", () => {
  const me = { id: J, name: "Javeria", phone: null, email: null, notes: null };
  const own = [line(10, 100, 80)]; // your invoice: owed 1000, profit 200
  const before = totalsOf(inv(), own);
  const bal = contractorBalances([me], [inv()], own, [{ id: "p", contractor_id: J, amount: 300, paid_on: "2026-02-01", method: null, reference: null, notes: null }],
    [cinv("a", "2026-01-10"), cinv("b", "2026-02-10")], [cline("a", 10, 79, 83), cline("b", 2, 50, 55), cline("b", 1, 10, 12, 1)]);
  assert.equal(bal[J].bought, 830 + 110 + 12); assert.equal(bal[J].spent, 790 + 100 + 10); assert.equal(bal[J].profit, 40 + 10 + 2);
  assert.equal(bal[J].paid, 300); assert.equal(bal[J].owed, 952 - 300); assert.equal(bal[J].orders, 2);
  assert.deepEqual(totalsOf(inv(), own), before);
  const ledger = contractorLedger(J, [cinv("a", "2026-01-10"), cinv("b", "2026-02-10")], [cline("a", 10, 79, 83), cline("b", 2, 50, 55)], [], [], [{ id: "p", contractor_id: J, amount: 300, paid_on: "2026-02-01", method: null, reference: null, notes: null }]);
  assert.deepEqual(ledger.map((r) => r.balance), [830, 530, 640]);
  // older invoices of yours that still name the contractor keep counting their cost of goods
  const old = contractorBalances([me], [inv({ contractor_id: J })], own, []);
  assert.equal(old[J].bought, 800);
});

test("a contractor invoice is read from the form", () => {
  const fd = new FormData();
  fd.set("contractor_id", J); fd.set("invoiced_on", "2026-03-01"); fd.set("ref", " order 5 ");
  fd.set("lines", JSON.stringify([{ name: "Airpods", upc: "1234", qty: 10, buy: "79", sell: "83" }, { name: "Roku", qty: 2, sell: "10.5" }]));
  const p = parseContractorInvoice(fd);
  assert.ok(p.ok);
  if (p.ok) { assert.equal(p.v.ref, "order 5"); assert.equal(p.v.lines[0].buy, 79); assert.equal(p.v.lines[1].buy, 0); assert.equal(p.v.lines[1].sell, 10.5); assert.equal(p.v.lines[0].upc, "1234"); }
  fd.set("lines", JSON.stringify([{ name: "Airpods", qty: 1, buy: "79" }]));
  assert.equal(parseContractorInvoice(fd).ok, false); // charge is required
  fd.set("lines", "[]");
  assert.equal(parseContractorInvoice(fd).ok, false);
});
