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
  try {
    const r = await draftNewReplies({ max: 4, force: true });
    revalidatePath("/ai/emails");
    if (r.waiting) return fail(r.waiting);
    return { ok: true, message: r.drafted ? `Wrote ${r.drafted} ${r.drafted === 1 ? "reply" : "replies"}.` : "No new leads with an email address to reply to." };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI couldn't write replies right now.");
  }
}
