// Builds the rows for each CSV download, and the whole tax package. Pure functions, used by /api/export (database)
// and by preview mode (browser).
import {
  contractorBalances, contractorInvoiceList, contractorLedger, invoiceTotalsMap, itemRows, monthOf, perMile, periodSummary, QUARTERS, rateFor, round2, TAX_LABEL, yearOf, type PeriodSummary,
} from "./calc.ts";
import { toCsv } from "./csv.ts";
import type { Data } from "./types.ts";

export type ExportKind = "items" | "expenses" | "invoices" | "invoice" | "taxes" | "contractor" | "income";
export type Row = Record<string, string | number | null>;
const fixed = (n: number) => Number(n).toFixed(2);
const BUSINESS_NAME: Record<string, string> = { resale: "Electronics resale", software: "Software services", shared: "Shared" };

/** `arg` is the contractor for a statement, the invoice for an invoice's items, or the quarter ("1" to "4", or "all") for the items list. */
export function buildExport(kind: string, d: Data, year: number | null, arg?: string): { name: string; rows: Row[] } | null {
  const inYear = (date: string) => year === null || yearOf(date) === year;
  const custName = (id: string | null) => d.customers.find((c) => c.id === id)?.name ?? "";
  const workerName = (id: string | null) => (id ? d.contractors.find((c) => c.id === id)?.name ?? "Unknown" : "Company");
  const totals = invoiceTotalsMap(d.invoices, d.lines);
  const tag = year === null ? "all" : String(year);
  let rows: Row[] = [];
  let name = `${kind}-${tag}`;

  const itemLines = (scoped: ReturnType<typeof itemRows>) => scoped.map((r) => ({
    Date: r.date, Invoice: r.docLabel, Customer: custName(r.customerId), Store: r.store, Item: r.itemName, "Last 4 UPC": r.upc, Quantity: r.qty,
    "Selling Price": fixed(r.priceEach), "Buying Price": fixed(r.costEach), "Gross Sales": fixed(r.sales), "Cost of Goods": fixed(r.cost), "Net Profit": fixed(r.profit), Paid: r.paid ? "Paid" : "",
  }));

  if (kind === "expenses") {
    rows = d.expenses.filter((e) => inYear(e.spent_on)).map((e) => ({
      date: e.spent_on, business: BUSINESS_NAME[e.business ?? "resale"], category: e.category, vendor: e.vendor, amount: fixed(e.amount), receipt_on_file: e.receipt_file_id ? "yes" : "no", notes: e.notes,
    }));
  } else if (kind === "income") {
    rows = (d.income ?? []).filter((r) => inYear(r.received_on)).map((r) => ({
      date: r.received_on, from_where: r.source, project: d.projects?.find((p) => p.id === r.project_id)?.name ?? "", amount: fixed(r.amount), notes: r.notes,
    }));
  } else if (kind === "invoices") {
    rows = d.invoices.filter((i) => inYear(i.invoice_date)).map((i) => {
      const t = totals.get(i.id)!;
      return {
        invoice_no: i.invoice_no, customer: custName(i.customer_id), date: i.invoice_date, items: t.units, they_owe: fixed(t.owed), spent_on_their_card: fixed(t.theirCard), spent_on_my_card: fixed(t.myCard), my_card: i.my_card ?? "", of_which_sales_tax: fixed(t.tax),
        cost_of_goods: fixed(t.cogs), profit: fixed(t.profit), tax_treatment: TAX_LABEL[i.tax_status] ?? i.tax_status, store: i.store, business_miles: t.miles || "", bought_by: workerName(i.contractor_id),
        status: i.status === "paid" ? "Paid" : "Not paid", paid_on: i.paid_on, file_attached: i.file_id ? "yes" : "no", notes: i.notes, type: i.kind === "po" ? "Purchase order" : "Invoice",
      };
    });
  } else if (kind === "invoice") {
    const inv = d.invoices.find((i) => i.id === arg);
    if (!inv) return null;
    rows = itemLines(itemRows(d).filter((r) => r.invoiceId === inv.id));
    name = `invoice-${inv.invoice_no.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  } else if (kind === "items") {
    const quarter = ["1", "2", "3", "4"].includes(String(arg)) ? Number(arg) : null;
    rows = itemLines(itemRows(d).filter((r) => inYear(r.date) && (quarter === null || Math.floor(monthOf(r.date) / 3) + 1 === quarter)));
    name = `items-${tag}${quarter ? `-q${quarter}` : ""}`;
  } else if (kind === "taxes" && year !== null) {
    const labels: [string, keyof PeriodSummary][] = [
      ["Total sales", "totalSales"], ["Resale and exempt sales", "resaleSales"], ["Taxable sales", "taxableSales"], ["Sales tax collected", "taxCollected"],
      ["Cost of goods sold", "cogs"], ["Gross profit", "grossProfit"], ["Business expenses", "expenses"], ["Net profit", "netProfit"],
      ["Business miles", "miles"], ["Mileage expense", "mileageExpense"], ["Net profit after mileage", "netAfterMileage"],
    ];
    const rate = rateFor(d.settings, year);
    const sum = (from: string, to: string) => periodSummary({ invoices: d.invoices, lines: d.lines, expenses: d.expenses, from, to, mileageRate: rate });
    const qs = QUARTERS.map((q) => sum(`${year}-${q.from}`, `${year}-${q.to}`));
    const full = sum(`${year}-01-01`, `${year}-12-31`);
    rows = labels.map(([label, key]) => ({
      line: label, Q1: fixed(qs[0][key]), Q2: fixed(qs[1][key]), Q3: fixed(qs[2][key]), Q4: fixed(qs[3][key]), [`Full year ${year}`]: fixed(full[key]),
    }));
    name = `tax-summary-${year}`;
  } else if (kind === "contractor") {
    const c = d.contractors.find((x) => x.id === arg);
    if (!c) return null;
    rows = contractorLedger(c.id, d.contractor_invoices ?? [], d.contractor_lines ?? [], d.invoices, d.lines, d.payments)
      .map((r) => ({ date: r.date, type: r.type, detail: r.detail, amount: fixed(r.change), balance_owed: fixed(r.balance) }));
    name = `statement-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  } else {
    return null;
  }
  if (rows.length === 0) rows = [{ note: "Nothing to export for this selection." }];
  return { name, rows };
}

export type PackageFile = { name: string; content: string };

/** Everything for one tax year, as separate files: summary, invoices, items, expenses, mileage log, contractors. */
export function buildPackage(d: Data, year: number): { name: string; files: PackageFile[] } {
  const csv = (kind: string, arg?: string) => "﻿" + toCsv(buildExport(kind, d, year, arg)?.rows ?? []);
  const rate = rateFor(d.settings, year);
  const totals = invoiceTotalsMap(d.invoices, d.lines);

  const mileage = d.invoices.filter((i) => yearOf(i.invoice_date) === year && Number(i.miles) > 0).sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))
    .map((i) => ({ date: i.invoice_date, invoice: i.invoice_no, store: i.store, business_miles: Number(i.miles), rate_per_mile: rate, deduction: fixed(round2(Number(i.miles) * rate)) }));
  const bal = contractorBalances(d.contractors, d.invoices, d.lines, d.payments, d.contractor_invoices ?? [], d.contractor_lines ?? []);
  const contractors = d.contractors.map((c) => ({
    contractor: c.name,
    invoiced_this_year: fixed(contractorInvoiceList(c.id, d.contractor_invoices ?? [], d.contractor_lines ?? []).filter((x) => yearOf(x.invoice.invoiced_on) === year).reduce((a, x) => a + x.billed, 0)),
    paid_back_this_year: fixed(d.payments.filter((p) => p.contractor_id === c.id && yearOf(p.paid_on) === year).reduce((a, p) => a + p.amount, 0)),
    still_owed_today: fixed(bal[c.id].owed),
  }));
  const unpaid = d.invoices.filter((i) => i.status !== "paid").reduce((a, i) => a + (totals.get(i.id)?.owed ?? 0), 0);

  const readme = [
    `Marketplace Wholesale LLC: tax package for ${year}`,
    `Made ${new Date().toISOString().slice(0, 10)}`,
    "",
    ...((d.quarters ?? []).filter((q) => q.year === year).length ? [`Finalized quarters for ${year}: ${(d.quarters ?? []).filter((q) => q.year === year).sort((a, b) => a.quarter - b.quarter).map((q) => `Q${q.quarter} (${q.finalized_at.slice(0, 10)})`).join(", ")}.`, ""] : []),
    "1-tax-summary.csv    Sales, cost of goods, expenses, miles and profit by quarter (Q1 to Q4) and for the full year.",
    "2-invoices.csv       Each invoice and purchase order: what the customer owes, cost of goods, profit, miles, paid or not paid.",
    "3-items.csv          Every item on every invoice: store, last 4 of the UPC, quantity, buying and selling price, profit.",
    "4-expenses.csv       Expenses, split by electronics resale, software services and shared.",
    "5-mileage-log.csv    Each invoice's business miles and the deduction at the rate below.",
    "6-contractors.csv    What each contractor bought, was paid back, and is still owed.",
    "7-software-income.csv  Money received on the software side: date, from where, project, amount.",
    "",
    `Mileage rate used for ${year}: ${perMile(rate)} per mile. Confirm the rate for the year with your accountant.`,
    `Customers still owe you (unpaid invoices today): $${fixed(unpaid)}.`,
    "Sales figures are before sales tax. Cost of goods is what you entered on each invoice (each item's cost, or the total cost you typed in).",
    "These files organize your records; confirm the tax treatment with your accountant before you file.",
    "",
  ].join("\r\n");

  return {
    name: `tax-package-${year}`,
    files: [
      { name: "README.txt", content: readme },
      { name: "1-tax-summary.csv", content: csv("taxes") },
      { name: "2-invoices.csv", content: csv("invoices") },
      { name: "3-items.csv", content: csv("items", "all") },
      { name: "4-expenses.csv", content: csv("expenses") },
      { name: "5-mileage-log.csv", content: "﻿" + toCsv(mileage.length ? mileage : [{ note: "No business miles logged for this year." }]) },
      { name: "7-software-income.csv", content: csv("income") },
      { name: "6-contractors.csv", content: "﻿" + toCsv(contractors.length ? contractors : [{ note: "No contractors." }]) },
    ],
  };
}
