"use server";
// Every change made in the app goes through these. Each one checks the sign-in, checks the role, and validates input
// (the checking itself lives in lib/validate.ts so preview mode follows the same rules).
// Next.js server actions also reject requests coming from other websites.
import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/access";
import type { Item } from "@/lib/types";
import { getStaffSession } from "@/lib/auth/session";
import { lockedMessage, money, perMile, quarterBounds, quarterLabel, quarterState, quarterSummary, sheetDate, todayCentral } from "@/lib/calc";
import { planInvoiceSave } from "@/lib/invoice-save";
import { readyDb } from "@/lib/db";
import { getData } from "@/lib/db/data";
import {
  fileProblem, day, id, parseContractor, parseContractorInvoice, parseQuarter, parseMileageRate, parseCustomer, parseExpense, parseIncome, parseInvoiceSave, parseProject, parseItem, parseItemUpdate, parsePayment, TAX_STATUSES,
} from "@/lib/validate";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const NO_DB = fail("The database isn't connected yet.");

async function ownerOnly(): Promise<ActionResult | null> {
  const staff = await getStaffSession();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.edit(staff.role)) return fail("This account can view records but not change them.");
  return null;
}

type Sql = NonNullable<Awaited<ReturnType<typeof readyDb>>>;

/** Refuses changes to anything dated in a finalized quarter. Returns the reason, or null when it's fine. */
async function frozen(sql: Sql, dates: (string | null | undefined)[]): Promise<ActionResult | null> {
  const wanted = dates.filter(Boolean);
  if (wanted.length === 0) return null;
  const rows = await sql`select year, quarter from mw_quarters`;
  const msg = lockedMessage(rows.map((r) => ({ year: r.year as number, quarter: r.quarter as number })), wanted);
  return msg ? fail(msg) : null;
}

/** Saves an uploaded PDF or photo into the database. Returns its id (null when no file was chosen). */
async function saveFile(sql: Sql, value: FormDataEntryValue | null): Promise<string | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  const bytes = Buffer.from(await value.arrayBuffer());
  const [row] = await sql`insert into mw_files (name, mime, size, data)
    values (${value.name.slice(0, 120) || "file"}, ${value.type}, ${bytes.length}, ${bytes}) returning id`;
  return row.id as string;
}

async function dropFile(sql: Sql, fileId: string | null | undefined) {
  if (fileId) await sql`delete from mw_files where id = ${fileId}`;
}

const done = (message?: string, id?: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message, id };
};

const isForeignKey = (e: unknown) => (e as { code?: string })?.code === "23503";
const isDuplicate = (e: unknown) => (e as { code?: string })?.code === "23505";

// ---- Items ----
export async function addItemAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseItem(fd); if (!p.ok) return fail(p.error);
  await sql`insert into mw_items (name, upc, sku, category) values (${p.v.name}, ${p.v.upc}, ${p.v.sku}, ${p.v.category})`;
  return done("Item added.");
}

export async function updateItemAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseItemUpdate(fd); if (!p.ok) return fail(p.error);
  await sql`update mw_items set name = ${p.v.name}, upc = ${p.v.upc}, sku = ${p.v.sku}, category = ${p.v.category} where id = ${p.v.itemId}`;
  return done("Item saved.");
}

export async function deleteItemAction(itemId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(itemId)) return fail("Unknown item.");
  try { await sql`delete from mw_items where id = ${itemId}`; } catch (e) {
    return fail(isForeignKey(e) ? "This item is on an invoice. Take it off the invoice first." : "Couldn't delete that item.");
  }
  return done();
}

export async function setMileageRateAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseMileageRate(fd); if (!p.ok) return fail(p.error);
  const [anyDone] = await sql`select count(*)::int as n from mw_quarters where year = ${p.v.year}`;
  if (anyDone?.n > 0) return fail(`A quarter in ${p.v.year} is finalized, so that year's mileage rate is locked. Reopen the quarter to change it.`);
  await sql`insert into mw_settings (key, value) values (${`mileage_rate_${p.v.year}`}, ${String(p.v.rate)})
    on conflict (key) do update set value = excluded.value`;
  return done(`Saved ${perMile(p.v.rate)} per mile for ${p.v.year}.`);
}

// ---- Invoices ----
/**
 * Saves an invoice with all of its items in one go: new, edited, or read from a PDF. Items are matched to the catalog by name
 * (new ones are created), and the old items on an edited invoice are replaced by what was sent.
 */
export async function saveInvoiceAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseInvoiceSave(fd); if (!p.ok) return fail(p.error);
  const v = p.v;
  const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
  let oldDate: string | null = null, oldFile: string | null = null;
  if (v.id) {
    const [cur] = await sql`select invoice_date::text as d, file_id from mw_invoices where id = ${v.id}`;
    if (!cur) return fail("That invoice no longer exists.");
    oldDate = cur.d as string; oldFile = (cur.file_id as string | null) ?? null;
  }
  const locked = await frozen(sql, [v.date, oldDate]); if (locked) return locked;
  const fileId = await saveFile(sql, fd.get("file"));
  const items = (await sql`select id, name, upc, sku, category from mw_items`) as unknown as Item[];
  const plan = planInvoiceSave(items, v.lines);
  try {
    const invoiceId = await sql.begin(async (tx) => {
      let customerId = v.customerId;
      if (!customerId && v.newCustomerName) {
        const [c] = await tx`insert into mw_customers (name, default_tax_status) values (${v.newCustomerName}, 'resale')
          on conflict (name) do update set name = excluded.name returning id`;
        customerId = c.id as string;
      }
      for (const it of plan.newItems) await tx`insert into mw_items (id, name, upc, sku, category) values (${it.id}, ${it.name}, ${it.upc}, null, null)`;
      for (const f of plan.upcFills) await tx`update mw_items set upc = ${f.upc} where id = ${f.id} and (upc is null or upc = '')`;
      let rowId = v.id;
      const paidOn = v.status === "paid" ? (v.paidOn ?? todayCentral()) : null;
      if (rowId) {
        await tx`update mw_invoices set kind = ${v.kind}, invoice_no = ${v.no}, customer_id = ${customerId}, invoice_date = ${v.date}, notes = ${v.notes},
            contractor_id = ${v.contractorId}, store = ${v.store}, miles = ${v.miles}, tax_status = ${v.taxStatus}, sales_tax = ${v.salesTax},
            total_override = ${v.totalOverride}, cost_override = ${v.costOverride}, their_card = ${v.theirCard}, my_card = ${v.myCard}, file_id = coalesce(${fileId}, file_id) where id = ${rowId}`;
        await tx`delete from mw_invoice_lines where invoice_id = ${rowId}`;
      } else {
        const [row] = await tx`insert into mw_invoices (kind, invoice_no, customer_id, invoice_date, status, paid_on, file_id, notes, contractor_id, store, miles, tax_status, sales_tax, total_override, cost_override, their_card, my_card)
          values (${v.kind}, ${v.no}, ${customerId}, ${v.date}, ${v.status}, ${paidOn}, ${fileId}, ${v.notes}, ${v.contractorId}, ${v.store}, ${v.miles}, ${v.taxStatus}, ${v.salesTax}, ${v.totalOverride}, ${v.costOverride}, ${v.theirCard}, ${v.myCard}) returning id`;
        rowId = row.id as string;
      }
      for (const l of plan.lines) {
        await tx`insert into mw_invoice_lines (invoice_id, item_id, qty, unit_price, unit_cost, position, own_card) values (${rowId}, ${l.item_id}, ${l.qty}, ${l.unit_price}, ${l.unit_cost}, ${l.position}, ${l.own_card})`;
      }
      return rowId as string;
    });
    if (fileId && oldFile) await dropFile(sql, oldFile);
    return done(v.id ? "Saved." : "Invoice saved.", invoiceId);
  } catch (e) {
    await dropFile(sql, fileId);
    return fail(isForeignKey(e) ? "That customer or contractor no longer exists." : "Couldn't save that invoice.");
  }
}

/** Attaches (or replaces) the Wave invoice PDF on an invoice. */
export async function uploadInvoiceFileAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const invoiceId = id(fd.get("invoice_id"));
  if (!invoiceId) return fail("Unknown invoice.");
  const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
  const fileId = await saveFile(sql, fd.get("file"));
  if (!fileId) return fail("Choose a file to upload.");
  const [old] = await sql`select file_id from mw_invoices where id = ${invoiceId}`;
  await sql`update mw_invoices set file_id = ${fileId} where id = ${invoiceId}`;
  await dropFile(sql, old?.file_id);
  return done("File attached.");
}

/** Confirms payment on the day you say it arrived (today if no day is given), or marks the invoice unpaid again. */
export async function setInvoicePaidAction(rowId: string, paid: boolean, paidOn?: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown invoice.");
  await sql`update mw_invoices set status = ${paid ? "paid" : "unpaid"}, paid_on = ${paid ? (day(paidOn) ?? todayCentral()) : null} where id = ${rowId}`;
  return done();
}

/** Marks every item on an invoice as bought with your card (they owe the full price) or with theirs (they owe only your profit). */
export async function setInvoiceCardAction(rowId: string, ownCard: boolean): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown invoice.");
  await sql`update mw_invoice_lines set own_card = ${ownCard} where invoice_id = ${rowId}`;
  return done();
}

/** Deletes the invoice and its items. */
export async function deleteInvoiceAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown invoice.");
  const [info] = await sql`select invoice_date::text as d from mw_invoices where id = ${rowId}`;
  const locked = await frozen(sql, [info?.d]); if (locked) return locked;
  const fileId = await sql.begin(async (tx) => {
    const [row] = await tx`delete from mw_invoices where id = ${rowId} returning file_id`;
    return (row?.file_id as string | null | undefined) ?? null;
  });
  await dropFile(sql, fileId);
  return done();
}

// ---- Expenses ----
export async function addExpenseAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseExpense(fd); if (!p.ok) return fail(p.error);
  const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
  const locked = await frozen(sql, [p.v.date]); if (locked) return locked;
  const fileId = await saveFile(sql, fd.get("file"));
  await sql`insert into mw_expenses (spent_on, category, vendor, amount, business, receipt_file_id, notes)
    values (${p.v.date}, ${p.v.category}, ${p.v.vendor}, ${p.v.total}, ${p.v.business}, ${fileId}, ${p.v.notes})`;
  return done("Expense saved.");
}

export async function deleteExpenseAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown expense.");
  const [info] = await sql`select spent_on::text as d from mw_expenses where id = ${rowId}`;
  const locked = await frozen(sql, [info?.d]); if (locked) return locked;
  const [row] = await sql`delete from mw_expenses where id = ${rowId} returning receipt_file_id`;
  await dropFile(sql, row?.receipt_file_id);
  return done();
}

// ---- Contractors ----
export async function addContractorAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseContractor(fd); if (!p.ok) return fail(p.error);
  try {
    await sql`insert into mw_contractors (name, phone, email, notes) values (${p.v.name}, ${p.v.phone}, ${p.v.email}, ${p.v.notes})`;
  } catch (e) {
    return fail(isDuplicate(e) ? "You already have a contractor with that name." : "Couldn't save that contractor.");
  }
  return done("Contractor added.");
}

export async function deleteContractorAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown contractor.");
  try { await sql`delete from mw_contractors where id = ${rowId}`; } catch (e) {
    return fail(isForeignKey(e) ? "This contractor has invoices or payments logged, so they can't be deleted." : "Couldn't delete that contractor.");
  }
  return done();
}

export async function addPaymentAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parsePayment(fd); if (!p.ok) return fail(p.error);
  try {
    await sql`insert into mw_contractor_payments (contractor_id, amount, paid_on, method, reference, notes)
      values (${p.v.contractorId}, ${p.v.total}, ${p.v.date}, ${p.v.method}, ${p.v.reference}, ${p.v.notes})`;
  } catch (e) {
    return fail(isForeignKey(e) ? "That contractor no longer exists." : "Couldn't save that payment.");
  }
  return done("Payment saved.");
}

/** Saves an invoice from a contractor to you, with its items. It is kept apart from your own invoices and totals. */
export async function saveContractorInvoiceAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseContractorInvoice(fd); if (!p.ok) return fail(p.error);
  const v = p.v;
  try {
    const rowId = await sql.begin(async (tx) => {
      let invoiceId = v.id;
      if (invoiceId) {
        const [cur] = await tx`select 1 from mw_contractor_invoices where id = ${invoiceId}`;
        if (!cur) throw new Error("gone");
        await tx`update mw_contractor_invoices set contractor_id = ${v.contractorId}, invoiced_on = ${v.date}, ref = ${v.ref}, notes = ${v.notes} where id = ${invoiceId}`;
        await tx`delete from mw_contractor_invoice_lines where invoice_id = ${invoiceId}`;
      } else {
        const [row] = await tx`insert into mw_contractor_invoices (contractor_id, invoiced_on, ref, notes) values (${v.contractorId}, ${v.date}, ${v.ref}, ${v.notes}) returning id`;
        invoiceId = row.id as string;
      }
      for (const [position, l] of v.lines.entries()) {
        await tx`insert into mw_contractor_invoice_lines (invoice_id, name, upc, qty, buy_price, sell_price, position) values (${invoiceId}, ${l.name}, ${l.upc}, ${l.qty}, ${l.buy}, ${l.sell}, ${position})`;
      }
      return invoiceId as string;
    });
    return done(v.id ? "Saved." : "Invoice saved.", rowId);
  } catch (e) {
    if (e instanceof Error && e.message === "gone") return fail("That invoice no longer exists.");
    return fail(isForeignKey(e) ? "That contractor no longer exists." : "Couldn't save that invoice.");
  }
}

export async function deleteContractorInvoiceAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown invoice.");
  await sql`delete from mw_contractor_invoices where id = ${rowId}`;
  return done();
}

export async function deletePaymentAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown payment.");
  await sql`delete from mw_contractor_payments where id = ${rowId}`;
  return done();
}

// ---- Customers ----
export async function addCustomerAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseCustomer(fd); if (!p.ok) return fail(p.error);
  try {
    await sql`insert into mw_customers (name, default_tax_status, notes) values (${p.v.name}, ${p.v.status}, ${p.v.notes})`;
  } catch (e) {
    return fail(isDuplicate(e) ? "You already have a customer with that name." : "Couldn't save that customer.");
  }
  return done("Customer added.");
}

export async function setCustomerTaxAction(rowId: string, status: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId) || !(TAX_STATUSES as readonly string[]).includes(status)) return fail("Unknown customer or tax setting.");
  await sql`update mw_customers set default_tax_status = ${status} where id = ${rowId}`;
  return done();
}

export async function uploadCertificateAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const customerId = id(fd.get("customer_id"));
  if (!customerId) return fail("Unknown customer.");
  const problem = fileProblem(fd.get("file")); if (problem) return fail(problem);
  const fileId = await saveFile(sql, fd.get("file"));
  if (!fileId) return fail("Choose a file to upload.");
  const [old] = await sql`select cert_file_id from mw_customers where id = ${customerId}`;
  await sql`update mw_customers set cert_file_id = ${fileId} where id = ${customerId}`;
  await dropFile(sql, old?.cert_file_id);
  return done("Certificate saved.");
}

export async function deleteCustomerAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown customer.");
  try {
    const [row] = await sql`delete from mw_customers where id = ${rowId} returning cert_file_id`;
    await dropFile(sql, row?.cert_file_id);
  } catch (e) {
    return fail(isForeignKey(e) ? "This customer has invoices logged, so it can't be deleted." : "Couldn't delete that customer.");
  }
  return done();
}

// ---- Quarters ----

/**
 * Finalizes a quarter: saves its totals and locks the invoices and expenses dated in it. It can be reopened.
 */
export async function finalizeQuarterAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseQuarter(fd); if (!p.ok) return fail(p.error);
  const { year, quarter, note } = p.v;
  const { from, to } = quarterBounds(year, quarter);
  const st = quarterState(year, quarter, todayCentral());
  if (!st.canFinalize) return fail(`${quarterLabel(year, quarter)} isn't over yet. You can finalize it on ${sheetDate(to)} or after.`);
  const loaded = await getData();
  if (loaded.state !== "ready") return NO_DB;
  const d = loaded.data;
  if (d.quarters.some((r) => r.year === year && r.quarter === quarter)) return fail(`${quarterLabel(year, quarter)} is already finalized.`);

  const snapshot = quarterSummary(d, year, quarter).snapshot;
  await sql`insert into mw_quarters (year, quarter, note, snapshot) values (${year}, ${quarter}, ${note}, ${sql.json(snapshot as unknown as Parameters<typeof sql.json>[0])})
    on conflict (year, quarter) do update set finalized_at = now(), note = excluded.note, snapshot = excluded.snapshot`;
  return done(`${quarterLabel(year, quarter)} is finalized.`);
}

export async function reopenQuarterAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseQuarter(fd); if (!p.ok) return fail(p.error);
  await sql`delete from mw_quarters where year = ${p.v.year} and quarter = ${p.v.quarter}`;
  return done(`${quarterLabel(p.v.year, p.v.quarter)} is open again.`);
}

// ---- Software side: projects and income ----
export async function saveProjectAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseProject(fd); if (!p.ok) return fail(p.error);
  const v = p.v;
  if (v.projectId) {
    const rows = await sql`update mw_projects set name = ${v.name}, client = ${v.client}, status = ${v.status}, notes = ${v.notes} where id = ${v.projectId} returning id`;
    return rows.length ? done("Project saved.") : fail("That project no longer exists.");
  }
  await sql`insert into mw_projects (name, client, status, notes) values (${v.name}, ${v.client}, ${v.status}, ${v.notes})`;
  return done("Project added.");
}

export async function deleteProjectAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown project.");
  await sql`delete from mw_projects where id = ${rowId}`; // its income stays, just without a project
  return done();
}

export async function saveIncomeAction(fd: FormData): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  const p = parseIncome(fd); if (!p.ok) return fail(p.error);
  const v = p.v;
  try {
    if (v.incomeId) {
      const rows = await sql`update mw_income set received_on = ${v.date}, source = ${v.source}, project_id = ${v.projectId}, amount = ${v.total}, notes = ${v.notes} where id = ${v.incomeId} returning id`;
      return rows.length ? done("Income saved.") : fail("That entry no longer exists.");
    }
    await sql`insert into mw_income (received_on, source, project_id, amount, notes) values (${v.date}, ${v.source}, ${v.projectId}, ${v.total}, ${v.notes})`;
  } catch (e) {
    if (isForeignKey(e)) return fail("That project no longer exists.");
    throw e;
  }
  return done("Income saved.");
}

export async function deleteIncomeAction(rowId: string): Promise<ActionResult> {
  const denied = await ownerOnly(); if (denied) return denied;
  const sql = await readyDb(); if (!sql) return NO_DB;
  if (!id(rowId)) return fail("Unknown income entry.");
  await sql`delete from mw_income where id = ${rowId}`;
  return done();
}
