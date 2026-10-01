"use server";
// Every change staff make in the app goes through these. Each checks the session and validates input.
// Next.js server actions also reject requests coming from other websites.
import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/access";
import { getStaffSession } from "@/lib/auth/session";
import { ACTIVITY_KINDS, logActivity, type ActivityKind } from "@/lib/crm/queries";
import * as data from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { formatDateTime } from "@/lib/utils/format";
import { zonedToUtc } from "@/lib/utils/time";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; conflict?: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const NO_DB = fail("This turns on when the database is connected.");

async function requireStaff() {
  return getStaffSession();
}

function cleanName(value: unknown, max = 60): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---- Team and sources (Settings) ----

export async function addRepAction(name: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the team.");
  const clean = cleanName(name, 40);
  if (clean.length < 2) return fail("Enter a name.");
  try { await data.addRep(clean); } catch { return NO_DB; }
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeRepAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the team.");
  if (!Number.isInteger(id)) return fail("Unknown salesperson.");
  try { await data.removeRep(id); } catch { return NO_DB; }
  revalidatePath("/settings");
  return { ok: true };
}

export async function addSourceAction(name: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the list.");
  const clean = cleanName(name, 50);
  if (clean.length < 2) return fail("Enter a source name.");
  try { await data.addSource(clean); } catch { return NO_DB; }
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeSourceAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the list.");
  if (!Number.isInteger(id)) return fail("Unknown source.");
  try { await data.removeSource(id); } catch { return NO_DB; }
  revalidatePath("/settings");
  return { ok: true };
}

// ---- Customer labels ----

const KEY_PATTERN = /^(p-\d{10}|e-[\w-]{4,200})$/;

export async function updateCustomerAction(
  key: string,
  name: string | null,
  field: data.CustomerField,
  value: string | null,
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!KEY_PATTERN.test(key)) return fail("Unknown customer.");

  let clean: string | number | null = value === "" ? null : value;
  switch (field) {
    case "rep":
      clean = clean === null ? null : Number(clean);
      if (clean !== null && !Number.isInteger(clean)) return fail("Unknown salesperson.");
      break;
    case "status":
      if (!data.STATUSES.some((s) => s.value === clean)) return fail("Unknown status.");
      break;
    case "financing":
      if (clean !== null && !data.FINANCING.some((f) => f.value === clean)) return fail("Unknown financing option.");
      break;
    case "state_scope":
      if (clean !== null && clean !== "in" && clean !== "out") return fail("Pick in state or out of state.");
      break;
    case "heard_from":
      clean = clean === null ? null : cleanName(clean, 50);
      break;
    case "notes":
      clean = String(value ?? "").slice(0, 4000);
      break;
    case "follow_up":
      if (clean !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(clean))) return fail("Pick a follow-up date.");
      break;
    case "purchased_vehicle":
      clean = clean === null ? null : cleanName(String(clean), 80) || null;
      break;
    case "purchase_followup":
      if (clean !== "on" && clean !== "off" && clean !== null) return fail("Unknown follow-up setting.");
      break;
    default:
      return fail("Unknown field.");
  }
  try {
    await data.updateCustomer(key, name ? cleanName(name, 80) : null, field, clean);
    const note = await describeChange(field, clean);
    if (note) await logActivity(key, note.kind, note.body, staff.name).catch(() => undefined);
  } catch {
    return NO_DB;
  }
  // Clears the browser's memory of other pages so they show this change; the row itself already shows it.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** A line for the customer's history when staff change something that matters later. */
async function describeChange(field: data.CustomerField, value: string | number | null): Promise<{ kind: ActivityKind; body: string } | null> {
  switch (field) {
    case "status":
      return { kind: "status", body: data.STATUSES.find((s) => s.value === value)?.label ?? String(value) };
    case "financing":
      return { kind: "financing", body: value ? data.FINANCING.find((f) => f.value === value)?.label ?? String(value) : "Cleared" };
    case "rep": {
      const rep = value ? (await data.listReps(true)).find((r) => r.id === value) : null;
      return { kind: "rep", body: rep ? `Assigned to ${rep.name}` : "Unassigned" };
    }
    case "follow_up":
      return { kind: "follow_up", body: value ? `Follow up on ${String(value).slice(5).replace("-", "/")}` : "Reminder cleared" };
    default:
      return null;
  }
}

/** "Log a call", "Texted", "Visited the lot", or a note, from the customer profile. */
export async function logActivityAction(key: string, kind: ActivityKind, body: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!KEY_PATTERN.test(key)) return fail("Unknown customer.");
  if (!(kind in ACTIVITY_KINDS) || !["call", "text", "email", "visit", "voicemail", "note"].includes(kind)) return fail("Pick what happened.");
  const text = String(body ?? "").trim().slice(0, 2000);
  if (kind === "note" && !text) return fail("Write the note first.");
  try {
    await logActivity(key, kind, text, staff.name);
    // Reaching someone new moves them out of the "nobody has contacted" list.
    if (kind !== "note") await data.markContacted(key, null);
  } catch {
    return NO_DB;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Added to the history." };
}

// ---- Appointments ----

export type AppointmentInput = {
  customerKey?: string | null;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  vehicle?: string | null;
  repId?: number | null;
  date: string;
  time: string;
  durationMin?: number;
  notes?: string;
  force?: boolean;
};

export async function createAppointmentAction(input: AppointmentInput): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const name = cleanName(input.customerName, 80);
  if (!name || /^name not provided$/i.test(name)) return fail("Enter the customer's name.");
  const vehicle = cleanName(input.vehicle, 80);
  if (vehicle.length < 2) return fail("Enter the car they're coming to see.");
  if (input.customerKey && !KEY_PATTERN.test(input.customerKey)) return fail("Unknown customer.");
  const startsAt = zonedToUtc(input.date, input.time, dealership.timeZone);
  if (!startsAt) return fail("Pick a date and time.");
  const durationMin = [30, 45, 60, 90, 120].includes(Number(input.durationMin)) ? Number(input.durationMin) : 60;
  const repId = input.repId ? Number(input.repId) : null;
  const digits = String(input.phone ?? "").replace(/\D/g, "");
  const phone = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (phone.length !== 10) return fail("Enter the customer's 10-digit phone number. It's required to book.");
  const email = String(input.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right.");

  try {
    if (!input.force) {
      const clash = await data.findConflict(repId, startsAt, durationMin);
      if (clash) {
        return {
          ok: false,
          error: `${clash.repName ?? "This salesperson"} already has ${clash.customerName} at ${formatDateTime(clash.startsAt.getTime())}.`,
          conflict: "Book anyway",
        };
      }
    }
    await data.createAppointment({
      // Walk-ins typed in by phone link up with that customer automatically.
      customerKey: input.customerKey ?? `p-${phone}`,
      customerName: name,
      phone,
      email: email || null,
      vehicle,
      repId,
      startsAt,
      durationMin,
      notes: String(input.notes ?? "").slice(0, 1000),
    });
    await logActivity(input.customerKey ?? `p-${phone}`, "appointment", `Booked for ${formatDateTime(startsAt.getTime())}`, staff.name).catch(() => undefined);
  } catch {
    return NO_DB;
  }
  revalidatePath("/appointments");
  return { ok: true, message: `Booked for ${formatDateTime(startsAt.getTime())}.` };
}

export async function setAppointmentStatusAction(id: number, status: data.AppointmentStatus): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!Number.isInteger(id) || !data.APPOINTMENT_STATUSES.some((s) => s.value === status)) return fail("Unknown appointment.");
  try { await data.setAppointmentStatus(id, status); } catch { return NO_DB; }
  revalidatePath("/appointments");
  return { ok: true };
}

// ---- Follow-ups (Dashboard) ----

export async function followUpAction(
  kind: "contacted" | "tomorrow" | "no_show_done",
  target: { key?: string | null; name?: string | null; appointmentId?: number | null },
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const key = target.key && KEY_PATTERN.test(target.key) ? target.key : null;
  const name = target.name ? cleanName(target.name, 80) : null;
  try {
    if (kind === "no_show_done") {
      if (!Number.isInteger(target.appointmentId)) return fail("Unknown appointment.");
      await data.markNoShowHandled(target.appointmentId!);
      if (key) await data.markContacted(key, name);
    } else if (!key) {
      return fail("Unknown customer.");
    } else if (kind === "contacted") {
      await data.markContacted(key, name);
      await logActivity(key, "call", "Contacted from the Dashboard", staff.name).catch(() => undefined);
    } else {
      const { addDays, dayKey } = await import("@/lib/utils/time");
      await data.snoozeFollowUp(key, name, addDays(dayKey(Date.now(), dealership.timeZone), 1));
    }
  } catch {
    return NO_DB;
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- AI assistant (what it knows about the dealership) ----

const AI_EDIT_DENIED = "Your account can't change this. Owners, managers and the developer can.";

export async function saveDealershipInfoAction(input: import("@/lib/ai/types").DealershipInfo): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const { saveDealershipInfo } = await import("@/lib/ai/settings");
  try { await saveDealershipInfo(input); } catch { return NO_DB; }
  revalidatePath("/ai/dealership");
  return { ok: true, message: "Saved." };
}

export async function saveAiInstructionsAction(instructions: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const { saveAiTraining } = await import("@/lib/ai/settings");
  try { await saveAiTraining({ instructions: String(instructions ?? "") }); } catch { return NO_DB; }
  revalidatePath("/ai/train");
  return { ok: true, message: "Saved." };
}

/** Saves the whole list of questions and answers (after adding, editing or deleting one). */
export async function saveAiQaAction(qa: import("@/lib/ai/types").QA[]): Promise<ActionResult & { qa?: import("@/lib/ai/types").QA[] }> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const { saveAiTraining } = await import("@/lib/ai/settings");
  try {
    const saved = await saveAiTraining({ qa });
    revalidatePath("/ai/train");
    return { ok: true, message: "Saved.", qa: saved.qa };
  } catch { return NO_DB; }
}

// ---- AI email replies ----

export async function sendAiReplyAction(id: number, subject: string, body: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { sendReply } = await import("@/lib/ai/replies");
  const result = await sendReply(Number(id), { subject: String(subject ?? ""), body: String(body ?? "") }, staff.name);
  if (!result.ok) return fail(result.error);
  revalidatePath("/ai/emails");
  return { ok: true, message: "Sent." };
}

export async function discardAiReplyAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { discardReply } = await import("@/lib/ai/replies");
  if (!(await discardReply(Number(id)))) return fail("This reply was already sent or discarded.");
  revalidatePath("/ai/emails");
  return { ok: true, message: "Discarded." };
}

/** "Write replies now": has the AI draft replies for new leads right away, even outside AI hours. */
export async function draftAiRepliesNowAction(): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const { draftNewReplies } = await import("@/lib/ai/replies");
  const { checkCustomerReplies, draftFollowups } = await import("@/lib/ai/followups");
  const { withGmail } = await import("@/lib/gmail");
  try {
    await withGmail((gmail) => checkCustomerReplies(gmail));
    const f = await draftFollowups({ max: 3, force: true });
    const r = await draftNewReplies({ max: 4, force: true });
    revalidatePath("/ai/emails");
    if (r.waiting && !f.drafted) return fail(r.waiting);
    const total = r.drafted + f.drafted;
    return { ok: true, message: total ? `Wrote ${total} ${total === 1 ? "reply" : "replies"}${f.drafted ? ` (${f.drafted} to customers who wrote back)` : ""}.` : "Nothing new to reply to." };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI couldn't write replies right now.");
  }
}

// ---- Billing (prices are set by the developer only) ----

export async function saveBillingSettingsAction(input: import("@/lib/billing/types").BillingSettings): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageBilling(staff.role)) return fail("Only the developer can change billing.");
  const { saveBillingSettings } = await import("@/lib/billing");
  try { await saveBillingSettings(input); } catch { return NO_DB; }
  revalidatePath("/billing");
  return { ok: true, message: "Saved. New prices apply to the next bill." };
}

export async function createInvoiceNowAction(): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageBilling(staff.role)) return fail("Only the developer can create bills.");
  const { ensureInvoice } = await import("@/lib/billing");
  try {
    const bill = await ensureInvoice();
    const { collectOpenBills } = await import("@/lib/billing");
    const collecting = bill ? await collectOpenBills() : 0;
    revalidatePath("/billing");
    return bill ? { ok: true, message: `Bill ${bill.number} is ready.${collecting ? " It will be collected from the connected bank account." : ""}` } : NO_DB;
  } catch { return NO_DB; }
}

export async function voidInvoiceAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageBilling(staff.role)) return fail("Only the developer can cancel bills.");
  const { voidInvoice } = await import("@/lib/billing");
  if (!(await voidInvoice(Number(id)))) return fail("Only unpaid bills can be canceled.");
  revalidatePath("/billing");
  return { ok: true, message: "Bill canceled. Click Create this month's bill to make it again with the current prices." };
}

export async function setAutoSendAction(on: boolean): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const { setAutoSend } = await import("@/lib/ai/replies");
  try { await setAutoSend(Boolean(on)); } catch { return NO_DB; }
  revalidatePath("/ai/emails");
  return { ok: true, message: on ? "Automatic sending is on." : "Automatic sending is off. The AI writes drafts; your team clicks Send." };
}

// ---- AI customer summary ----

export async function summarizeCustomerAction(key: string): Promise<ActionResult & { summary?: import("@/lib/ai/summary").CustomerSummary }> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { summarizeCustomer } = await import("@/lib/ai/summary");
  try {
    const summary = await summarizeCustomer(String(key));
    return { ok: true, message: "Summary updated.", summary };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI couldn't summarize right now.");
  }
}

// ---- Texting ----

export async function sendTextAction(customerKey: string, body: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { getCustomer } = await import("@/lib/crm/queries");
  const { sendText } = await import("@/lib/sms");
  const customer = await getCustomer(String(customerKey));
  if (!customer?.phone) return fail("This customer has no phone number.");
  const r = await sendText({ customerKey: customer.key, phone: customer.phone, body: String(body ?? ""), sentBy: staff.name });
  return r.ok ? { ok: true, message: "Sent." } : fail(r.error);
}

export async function sendTextDraftAction(id: number, customerKey: string, body: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { getCustomer } = await import("@/lib/crm/queries");
  const { sendText } = await import("@/lib/sms");
  const customer = await getCustomer(String(customerKey));
  if (!customer?.phone) return fail("This customer has no phone number.");
  const r = await sendText({ customerKey: customer.key, phone: customer.phone, body: String(body ?? ""), sentBy: staff.name, ai: true, draftId: Number(id) });
  if (r.ok) {
    const { after } = await import("next/server");
    const { refreshSummarySoon } = await import("@/lib/ai/summary");
    after(() => refreshSummarySoon(customer.key));
  }
  return r.ok ? { ok: true, message: "Sent." } : fail(r.error);
}

export async function discardTextDraftAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { discardDraft } = await import("@/lib/sms");
  return (await discardDraft(Number(id))) ? { ok: true, message: "Discarded." } : fail("This draft was already sent or discarded.");
}

export async function aiDraftTextAction(customerKey: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const { getCustomer } = await import("@/lib/crm/queries");
  const { aiReplyToText } = await import("@/lib/sms");
  const customer = await getCustomer(String(customerKey));
  if (!customer?.phone) return fail("This customer has no phone number.");
  try {
    const r = await aiReplyToText(customer.key, customer.phone, { force: true });
    return r === "skipped" ? fail("Nothing for the AI to answer yet (or this customer replied STOP).") : { ok: true, message: r === "sent" ? "The AI replied." : "The AI wrote a draft below." };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI couldn't write a reply right now.");
  }
}

export async function setAutoTextAction(on: boolean): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const { setAutoText } = await import("@/lib/sms");
  try { await setAutoText(Boolean(on)); } catch { return NO_DB; }
  revalidatePath("/ai/texts");
  return { ok: true, message: on ? "Automatic texting is on." : "Automatic texting is off. The AI writes drafts; your team clicks Send." };
}

export async function savePurchaseFollowupAction(on: boolean, days: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!can.editAiSettings(staff.role)) return fail(AI_EDIT_DENIED);
  const d = Math.round(Number(days));
  if (!Number.isFinite(d) || d < 1 || d > 60) return fail("Pick a number of days from 1 to 60.");
  const { setPurchaseFollowup } = await import("@/lib/sms");
  try { await setPurchaseFollowup(Boolean(on), d); } catch { return NO_DB; }
  revalidatePath("/ai/automations");
  return { ok: true, message: on ? `Saved. Customers get a follow-up text ${d} day${d === 1 ? "" : "s"} after they're marked purchased.` : "Saved. Purchase follow-up texts are off." };
}

export async function disconnectBankAction(): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.viewBilling(staff.role)) return fail("Only the owner can change how bills are paid.");
  const { getBankMandate, setBankMandate } = await import("@/lib/billing");
  const { cancelMandate } = await import("@/lib/billing/gocardless");
  const mandate = await getBankMandate();
  if (!mandate) return fail("No bank account is connected.");
  try { await cancelMandate(mandate); } catch { /* already canceled at GoCardless */ }
  await setBankMandate(null);
  revalidatePath("/billing");
  return { ok: true, message: "Bank account disconnected. Future bills won't be collected automatically." };
}

export async function retryBankPaymentAction(invoiceId: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.viewBilling(staff.role)) return fail("Only the owner can pay bills.");
  const { collectFromBank, getInvoice } = await import("@/lib/billing");
  const invoice = await getInvoice(Number(invoiceId));
  if (!invoice) return fail("Bill not found.");
  const r = await collectFromBank(invoice);
  revalidatePath("/billing");
  return r.ok ? { ok: true, message: "Bank payment started." } : fail(r.error);
}

export async function turnOffCardAutopayAction(): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.viewBilling(staff.role)) return fail("Only the owner can change how bills are paid.");
  const { setCardAutopay } = await import("@/lib/billing");
  await setCardAutopay(null);
  revalidatePath("/billing");
  return { ok: true, message: "Autopay is off. Pay each bill with the Pay button." };
}

// ---- Adding a customer by hand (walk-ins, phone calls, referrals) ----

export async function addCustomerAction(input: { name: string; phone: string; email: string; vehicle: string; heardFrom: string; notes: string; purchased?: boolean; purchasedOn?: string }):
  Promise<ActionResult & { key?: string }> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  const name = cleanName(input.name, 80);
  const phone = String(input.phone ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 120);
  const vehicle = cleanName(input.vehicle, 80);
  if (!name) return fail("Enter the customer's name.");
  if (phone && phone.length !== 10) return fail("Enter a 10-digit phone number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right.");
  if (!phone && !email) return fail("Enter a phone number or an email, so you can reach them.");
  const { customerKey } = await import("@/lib/customers");
  const key = customerKey({ phone: phone || null, email: email || null } as never)!;
  const sql = await (await import("@/lib/db")).readyDb();
  if (!sql) return NO_DB;
  const search = [name, phone, email, vehicle].filter(Boolean).join(" ").toLowerCase();
  // "They already bought": saved as purchased, on the day they bought (today if not given), so the follow-up text is timed from then.
  const bought = Boolean(input.purchased);
  const boughtOn = bought && /^\d{4}-\d{2}-\d{2}$/.test(String(input.purchasedOn ?? "")) && new Date(`${input.purchasedOn}T12:00:00Z`) <= new Date()
    ? new Date(`${input.purchasedOn}T12:00:00-05:00`) : bought ? new Date() : null;
  if (bought && !vehicle) return fail("Enter the car they bought, so the follow-up text can ask about it.");
  if (bought && !phone) return fail("Enter their phone number so the follow-up text has somewhere to go.");
  // If they already exist (e.g. an old lead), bring them back with the new details instead of making a duplicate.
  await sql`
    insert into customers (key, name, phone, email, status, purchased_at, purchased_vehicle, first_seen, last_seen, vehicles, last_vehicle, heard_from, notes, search, updated_at)
    values (${key}, ${name}, ${phone || null}, ${email || null}, ${bought ? "purchased" : "new"}, ${boughtOn}, ${bought ? vehicle : null}, now(), now(), ${vehicle ? [vehicle] : []}, ${vehicle || null},
            ${cleanName(input.heardFrom, 60) || null}, ${String(input.notes ?? "").slice(0, 2000)}, ${search}, now())
    on conflict (key) do update set
      name = excluded.name, last_seen = now(), updated_at = now(),
      status = case when ${bought} then 'purchased' else customers.status end,
      purchased_at = case when ${bought} then coalesce(${boughtOn}, now()) else customers.purchased_at end,
      purchased_vehicle = case when ${bought} then ${vehicle || null} else customers.purchased_vehicle end,
      purchase_followup_at = case when ${bought} then null else customers.purchase_followup_at end,
      phone = coalesce(excluded.phone, customers.phone), email = coalesce(excluded.email, customers.email),
      last_vehicle = coalesce(excluded.last_vehicle, customers.last_vehicle),
      vehicles = case when excluded.last_vehicle is null or excluded.last_vehicle = any(customers.vehicles) then customers.vehicles else customers.vehicles || excluded.vehicles end,
      heard_from = coalesce(excluded.heard_from, customers.heard_from),
      notes = case when excluded.notes = '' then customers.notes else trim(both from customers.notes || E'\n' || excluded.notes) end,
      search = customers.search || ' ' || excluded.search`;
  const { logActivity } = await import("@/lib/crm/queries");
  await logActivity(key, bought ? "status" : "note", bought ? `Purchased: ${vehicle}` : `Added by hand${vehicle ? `, interested in ${vehicle}` : ""}`, staff.name).catch(() => undefined);
  revalidatePath("/customers");
  revalidatePath("/pipeline");
  return { ok: true, message: "Customer added.", key };
}
