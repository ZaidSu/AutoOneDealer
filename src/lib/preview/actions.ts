// Preview mode's version of every server action: same names, same checks (lib/validate.ts), same messages,
// but saved in this browser instead of the database. Client-only.
import type { ActionResult } from "@/app/actions";
import { lockedMessage, perMile, quarterBounds, quarterLabel, quarterState, quarterSummary, sheetDate, todayCentral } from "../calc.ts";
import { planInvoiceSave } from "../invoice-save.ts";
import {
  fileProblem, day, id, parseContractor, parseQuarter, parseMileageRate, parseCustomer, parseContractorInvoice, parseExpense, parseIncome, parseInvoiceSave, parseProject, parseItem, parseItemUpdate, parsePayment, TAX_STATUSES,
} from "../validate.ts";
import { dropFileLocal, getSnapshot, mutate, saveFileLocal } from "./store.ts";
import type { Business, Data, TaxStatus } from "../types.ts";

const fail = (error: string): ActionResult => ({ ok: false, error });
const uuid = () => crypto.randomUUID();
const fileOf = (fd: FormData): File | null => { const f = fd.get("file"); return f instanceof File && f.size > 0 ? f : null; };

/** Runs a change to the saved data. `check` can refuse before anything is saved. */
function change(message: string | undefined, run: (d: Data) => void, id?: string): ActionResult {
  const problem = mutate(run);
  return problem ? fail(problem) : { ok: true, message, id };
}
const find = <T extends { id: string }>(rows: T[], rowId: string) => rows.find((r) => r.id === rowId);
const now = (): Data => getSnapshot() as Data;
/** Refuses changes to anything dated in a finalized quarter. */
const frozen = (...dates: (string | null | undefined)[]): ActionResult | null => { const m = lockedMessage(now().quarters, dates); return m ? fail(m) : null; };

export const previewActions = {
  // ---- Items ----
  async addItemAction(fd: FormData): Promise<ActionResult> {
    const p = parseItem(fd); if (!p.ok) return fail(p.error);
    return change("Item added.", (d) => { d.items.push({ id: uuid(), name: p.v.name, upc: p.v.upc, sku: p.v.sku, category: p.v.category }); });
  },
  async updateItemAction(fd: FormData): Promise<ActionResult> {
    const p = parseItemUpdate(fd); if (!p.ok) return fail(p.error);
    return change("Item saved.", (d) => { const it = find(d.items, p.v.itemId); if (it) { it.name = p.v.name; it.upc = p.v.upc; it.sku = p.v.sku; it.category = p.v.category; } });
  },
  async deleteItemAction(itemId: string): Promise<ActionResult> {
    if (!id(itemId)) return fail("Unknown item.");
    const d = now();
    if (d.lines.some((r) => r.item_id === itemId)) return fail("This item is on an invoice. Take it off the invoice first.");
    return change(undefined, (x) => { x.items = x.items.filter((r) => r.id !== itemId); });
  },

  async setMileageRateAction(fd: FormData): Promise<ActionResult> {
    const p = parseMileageRate(fd); if (!p.ok) return fail(p.error);
    if (now().quarters.some((q) => q.year === p.v.year)) return fail(`A quarter in ${p.v.year} is finalized, so that year's mileage rate is locked. Reopen the quarter to change it.`);
    return change(`Saved ${perMile(p.v.rate)} per mile for ${p.v.year}.`, (x) => { x.settings = { ...x.settings, mileageRates: { ...x.settings.mileageRates, [String(p.v.year)]: p.v.rate } }; });
  },

  // ---- Invoices ----
  async setInvoiceCardAction(rowId: string, ownCard: boolean): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown invoice.");
    return change(undefined, (x) => { x.lines.forEach((l) => { if (l.invoice_id === rowId) l.own_card = ownCard; }); });
  },

  /** Saves an invoice with all of its items: new, edited, or read from a PDF. Same rules as the database version. */
  async saveInvoiceAction(fd: FormData): Promise<ActionResult> {
    const p = parseInvoiceSave(fd); if (!p.ok) return fail(p.error);
    const v = p.v, d = now();
    const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
    const existing = v.id ? find(d.invoices, v.id) : undefined;
    if (v.id && !existing) return fail("That invoice no longer exists.");
    const locked = frozen(v.date, existing?.invoice_date); if (locked) return locked;
    if ((v.customerId && !find(d.customers, v.customerId)) || (v.contractorId && !find(d.contractors, v.contractorId))) return fail("That customer or contractor no longer exists.");
    const file = fileOf(fd);
    const fileId = file ? await saveFileLocal(file) : null;
    const plan = planInvoiceSave(d.items, v.lines);
    const rowId = existing?.id ?? uuid();
    const result = change(v.id ? "Saved." : "Invoice saved.", (x) => {
      let customerId = v.customerId;
      if (!customerId && v.newCustomerName) {
        const found = x.customers.find((c) => c.name === v.newCustomerName);
        customerId = found?.id ?? uuid();
        if (!found) x.customers.push({ id: customerId, name: v.newCustomerName, default_tax_status: "resale", cert_file_id: null, notes: null });
      }
      x.items.push(...plan.newItems);
      for (const f of plan.upcFills) { const it = find(x.items, f.id); if (it && !it.upc) it.upc = f.upc; }
      const fields = {
        kind: v.kind, invoice_no: v.no, customer_id: customerId, invoice_date: v.date, notes: v.notes, contractor_id: v.contractorId, store: v.store, miles: v.miles,
        tax_status: v.taxStatus as TaxStatus, sales_tax: v.salesTax, total_override: v.totalOverride, cost_override: v.costOverride, their_card: v.theirCard, my_card: v.myCard,
      };
      const inv = find(x.invoices, rowId);
      if (inv) { Object.assign(inv, fields); if (fileId) inv.file_id = fileId; }
      else x.invoices.push({ id: rowId, status: v.status, paid_on: v.status === "paid" ? (v.paidOn ?? todayCentral()) : null, file_id: fileId, ...fields });
      x.lines = x.lines.filter((l) => l.invoice_id !== rowId);
      x.lines.push(...plan.lines.map((l) => ({ id: uuid(), invoice_id: rowId, ...l })));
    }, rowId);
    if (!result.ok) await dropFileLocal(fileId);
    else if (fileId && existing?.file_id) await dropFileLocal(existing.file_id);
    return result;
  },
  /** Attaches (or replaces) the Wave invoice PDF on an invoice. */
  async uploadInvoiceFileAction(fd: FormData): Promise<ActionResult> {
    const invoiceId = id(fd.get("invoice_id"));
    if (!invoiceId) return fail("Unknown invoice.");
    const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
    const file = fileOf(fd);
    if (!file) return fail("Choose a file to upload.");
    const old = find(now().invoices, invoiceId)?.file_id;
    const fileId = await saveFileLocal(file);
    const result = change("File attached.", (x) => { const inv = find(x.invoices, invoiceId); if (inv) inv.file_id = fileId; });
    if (result.ok) await dropFileLocal(old); else await dropFileLocal(fileId);
    return result;
  },
  async setInvoicePaidAction(rowId: string, paid: boolean, paidOn?: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown invoice.");
    return change(undefined, (x) => { const r = find(x.invoices, rowId); if (r) { r.status = paid ? "paid" : "unpaid"; r.paid_on = paid ? (day(paidOn) ?? todayCentral()) : null; } });
  },
  /** Deletes the invoice and its items. */
  async deleteInvoiceAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown invoice.");
    const row = find(now().invoices, rowId);
    const locked = frozen(row?.invoice_date); if (locked) return locked;
    const result = change(undefined, (x) => {
      x.lines = x.lines.filter((l) => l.invoice_id !== rowId);
      x.invoices = x.invoices.filter((r) => r.id !== rowId);
    });
    if (result.ok) await dropFileLocal(row?.file_id);
    return result;
  },
  // ---- Software side: projects and income ----
  async saveProjectAction(fd: FormData): Promise<ActionResult> {
    const p = parseProject(fd); if (!p.ok) return fail(p.error);
    const v = p.v;
    if (v.projectId && !find(now().projects, v.projectId)) return fail("That project no longer exists.");
    return change(v.projectId ? "Project saved." : "Project added.", (d) => {
      const row = v.projectId ? find(d.projects, v.projectId) : undefined;
      if (row) { row.name = v.name; row.client = v.client; row.status = v.status; row.notes = v.notes; }
      else d.projects.push({ id: uuid(), name: v.name, client: v.client, status: v.status, notes: v.notes });
    });
  },
  async deleteProjectAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown project.");
    return change(undefined, (x) => { x.projects = x.projects.filter((r) => r.id !== rowId); x.income.forEach((r) => { if (r.project_id === rowId) r.project_id = null; }); });
  },
  async saveIncomeAction(fd: FormData): Promise<ActionResult> {
    const p = parseIncome(fd); if (!p.ok) return fail(p.error);
    const v = p.v;
    if (v.projectId && !find(now().projects, v.projectId)) return fail("That project no longer exists.");
    if (v.incomeId && !find(now().income, v.incomeId)) return fail("That entry no longer exists.");
    return change("Income saved.", (d) => {
      const row = v.incomeId ? find(d.income, v.incomeId) : undefined;
      if (row) { row.received_on = v.date; row.source = v.source; row.project_id = v.projectId; row.amount = v.total; row.notes = v.notes; }
      else d.income.push({ id: uuid(), received_on: v.date, source: v.source, project_id: v.projectId, amount: v.total, notes: v.notes });
    });
  },
  async deleteIncomeAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown income entry.");
    return change(undefined, (x) => { x.income = x.income.filter((r) => r.id !== rowId); });
  },

  // ---- Expenses ----
  async addExpenseAction(fd: FormData): Promise<ActionResult> {
    const p = parseExpense(fd); if (!p.ok) return fail(p.error);
    const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
    const locked = frozen(p.v.date); if (locked) return locked;
    const file = fileOf(fd);
    const fileId = file ? await saveFileLocal(file) : null;
    const result = change("Expense saved.", (x) => { x.expenses.push({ id: uuid(), spent_on: p.v.date, category: p.v.category, vendor: p.v.vendor, amount: p.v.total, business: p.v.business as Business, receipt_file_id: fileId, notes: p.v.notes }); });
    if (!result.ok) await dropFileLocal(fileId);
    return result;
  },
  async deleteExpenseAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown expense.");
    const row = find(now().expenses, rowId);
    const locked = frozen(row?.spent_on); if (locked) return locked;
    const result = change(undefined, (x) => { x.expenses = x.expenses.filter((r) => r.id !== rowId); });
    if (result.ok) await dropFileLocal(row?.receipt_file_id);
    return result;
  },

  // ---- Contractors ----
  async addContractorAction(fd: FormData): Promise<ActionResult> {
    const p = parseContractor(fd); if (!p.ok) return fail(p.error);
    if (now().contractors.some((c) => c.name === p.v.name)) return fail("You already have a contractor with that name.");
    return change("Contractor added.", (x) => { x.contractors.push({ id: uuid(), name: p.v.name, phone: p.v.phone, email: p.v.email, notes: p.v.notes }); });
  },
  async deleteContractorAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown contractor.");
    const d = now();
    if (d.invoices.some((r) => r.contractor_id === rowId) || d.payments.some((r) => r.contractor_id === rowId)) return fail("This contractor has invoices or payments logged, so they can't be deleted.");
    return change(undefined, (x) => { x.contractors = x.contractors.filter((r) => r.id !== rowId); });
  },
  async addPaymentAction(fd: FormData): Promise<ActionResult> {
    const p = parsePayment(fd); if (!p.ok) return fail(p.error);
    if (!find(now().contractors, p.v.contractorId)) return fail("That contractor no longer exists.");
    return change("Payment saved.", (x) => { x.payments.push({ id: uuid(), contractor_id: p.v.contractorId, amount: p.v.total, paid_on: p.v.date, method: p.v.method, reference: p.v.reference, notes: p.v.notes }); });
  },
  async saveContractorInvoiceAction(fd: FormData): Promise<ActionResult> {
    const p = parseContractorInvoice(fd); if (!p.ok) return fail(p.error);
    const v = p.v, d = now();
    if (!find(d.contractors, v.contractorId)) return fail("That contractor no longer exists.");
    if (v.id && !find(d.contractor_invoices, v.id)) return fail("That invoice no longer exists.");
    const rowId = v.id ?? uuid();
    return change(v.id ? "Saved." : "Invoice saved.", (x) => {
      const fields = { contractor_id: v.contractorId, invoiced_on: v.date, ref: v.ref, notes: v.notes };
      const row = find(x.contractor_invoices, rowId);
      if (row) Object.assign(row, fields); else x.contractor_invoices.push({ id: rowId, ...fields });
      x.contractor_lines = x.contractor_lines.filter((l) => l.invoice_id !== rowId);
      x.contractor_lines.push(...v.lines.map((l, position) => ({ id: uuid(), invoice_id: rowId, name: l.name, upc: l.upc, qty: l.qty, buy_price: l.buy, sell_price: l.sell, position })));
    }, rowId);
  },
  async deleteContractorInvoiceAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown invoice.");
    return change(undefined, (x) => { x.contractor_invoices = x.contractor_invoices.filter((r) => r.id !== rowId); x.contractor_lines = x.contractor_lines.filter((l) => l.invoice_id !== rowId); });
  },
  async deletePaymentAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown payment.");
    return change(undefined, (x) => { x.payments = x.payments.filter((r) => r.id !== rowId); });
  },

  // ---- Customers ----
  async addCustomerAction(fd: FormData): Promise<ActionResult> {
    const p = parseCustomer(fd); if (!p.ok) return fail(p.error);
    if (now().customers.some((c) => c.name === p.v.name)) return fail("You already have a customer with that name.");
    return change("Customer added.", (x) => { x.customers.push({ id: uuid(), name: p.v.name, default_tax_status: p.v.status as TaxStatus, cert_file_id: null, notes: p.v.notes }); });
  },
  async setCustomerTaxAction(rowId: string, status: string): Promise<ActionResult> {
    if (!id(rowId) || !(TAX_STATUSES as readonly string[]).includes(status)) return fail("Unknown customer or tax setting.");
    return change(undefined, (x) => { const c = find(x.customers, rowId); if (c) c.default_tax_status = status as TaxStatus; });
  },
  async uploadCertificateAction(fd: FormData): Promise<ActionResult> {
    const customerId = id(fd.get("customer_id"));
    if (!customerId) return fail("Unknown customer.");
    const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
    const file = fileOf(fd);
    if (!file) return fail("Choose a file to upload.");
    const old = find(now().customers, customerId)?.cert_file_id;
    const fileId = await saveFileLocal(file);
    const result = change("Certificate saved.", (x) => { const c = find(x.customers, customerId); if (c) c.cert_file_id = fileId; });
    if (result.ok) await dropFileLocal(old); else await dropFileLocal(fileId);
    return result;
  },
  async deleteCustomerAction(rowId: string): Promise<ActionResult> {
    if (!id(rowId)) return fail("Unknown customer.");
    const d = now();
    if (d.invoices.some((r) => r.customer_id === rowId)) return fail("This customer has invoices logged, so it can't be deleted.");
    const row = find(d.customers, rowId);
    const result = change(undefined, (x) => { x.customers = x.customers.filter((r) => r.id !== rowId); });
    if (result.ok) await dropFileLocal(row?.cert_file_id);
    return result;
  },

  // ---- Quarters ----
  /** Finalizes a quarter: freezes what each unlocked sale cost, saves the totals, and locks it until it's reopened. */
  async finalizeQuarterAction(fd: FormData): Promise<ActionResult> {
    const p = parseQuarter(fd); if (!p.ok) return fail(p.error);
    const { year, quarter, note } = p.v;
    const { from, to } = quarterBounds(year, quarter);
    if (!quarterState(year, quarter, todayCentral()).canFinalize) return fail(`${quarterLabel(year, quarter)} isn't over yet. You can finalize it on ${sheetDate(to)} or after.`);
    const d = now();
    if (d.quarters.some((r) => r.year === year && r.quarter === quarter)) return fail(`${quarterLabel(year, quarter)} is already finalized.`);
    const snapshot = quarterSummary(d, year, quarter).snapshot;
    return change(`${quarterLabel(year, quarter)} is finalized.`, (x) => {
      x.quarters = [...x.quarters.filter((r) => !(r.year === year && r.quarter === quarter)), { year, quarter, finalized_at: new Date().toISOString(), note, snapshot }]
        .sort((a, b) => b.year - a.year || b.quarter - a.quarter);
    });
  },
  async reopenQuarterAction(fd: FormData): Promise<ActionResult> {
    const p = parseQuarter(fd); if (!p.ok) return fail(p.error);
    return change(`${quarterLabel(p.v.year, p.v.quarter)} is open again.`, (x) => { x.quarters = x.quarters.filter((r) => !(r.year === p.v.year && r.quarter === p.v.quarter)); });
  },
};
