"use server";
// Every change staff make in the app goes through these. Each checks the session and validates input.
// Next.js server actions also reject requests coming from other websites.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/access";
import { GMAIL_COOKIE, getStaffSession, readSealed, type GmailConnection } from "@/lib/auth/session";
import * as data from "@/lib/db/data";
import { dbState } from "@/lib/db";
import { setupDatabase } from "@/lib/db/schema";
import { dealership } from "@/lib/dealership";
import { saveSharedGmailConnection } from "@/lib/gmail/connection";
import { formatDateTime } from "@/lib/format";
import { zonedToUtc } from "@/lib/time";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; conflict?: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const NO_DB = fail("This turns on when the database is connected.");

async function requireStaff() {
  return getStaffSession();
}

function cleanName(value: unknown, max = 60): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---- Database setup (Developer page) ----

export async function setupDatabaseAction(): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.useDeveloperTools(staff.role)) return fail("Only owners and developers can do this.");
  if ((await dbState()) === "not_configured") return fail("Add DATABASE_URL in Vercel first, then redeploy.");
  try {
    await setupDatabase();
    // Move this browser's Gmail connection into the database so every device shares it.
    const jar = await cookies();
    const local = readSealed<GmailConnection>(jar.get(GMAIL_COOKIE)?.value);
    if (local) await saveSharedGmailConnection(local);
    revalidatePath("/", "layout");
    return { ok: true, message: local ? "Database is ready, and the Gmail connection is now shared." : "Database is ready." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Database setup failed:", detail);
    const hint = /password authentication|SASL|28P01/i.test(detail)
      ? "The password in DATABASE_URL is wrong. Reset it in Supabase and update DATABASE_URL in Vercel."
      : /timed out|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(detail)
        ? "Couldn't reach the database. Make sure DATABASE_URL is the Transaction pooler address (pooler.supabase.com) and the Supabase project isn't paused."
        : "Setup failed. Check that DATABASE_URL is the Supabase Transaction pooler address with the right password.";
    return fail(`${hint} (${detail.replace(/postgres(ql)?:\/\/\S+/g, "[address hidden]").slice(0, 120)})`);
  }
}

// ---- Team and sources (Settings) ----

export async function addRepAction(name: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the team.");
  const clean = cleanName(name, 40);
  if (clean.length < 2) return fail("Enter a name.");
  try { await data.addRep(clean); } catch { return NO_DB; }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeRepAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the team.");
  if (!Number.isInteger(id)) return fail("Unknown salesperson.");
  try { await data.removeRep(id); } catch { return NO_DB; }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addSourceAction(name: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the list.");
  const clean = cleanName(name, 50);
  if (clean.length < 2) return fail("Enter a source name.");
  try { await data.addSource(clean); } catch { return NO_DB; }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeSourceAction(id: number): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff || !can.manageIntegrations(staff.role)) return fail("Only owners and managers can change the list.");
  if (!Number.isInteger(id)) return fail("Unknown source.");
  try { await data.removeSource(id); } catch { return NO_DB; }
  revalidatePath("/", "layout");
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
    default:
      return fail("Unknown field.");
  }
  try {
    await data.updateCustomer(key, name ? cleanName(name, 80) : null, field, clean);
  } catch {
    return NO_DB;
  }
  revalidatePath("/customers");
  revalidatePath("/analytics");
  return { ok: true };
}

// ---- Appointments ----

export type AppointmentInput = {
  customerKey?: string | null;
  customerName: string;
  phone?: string | null;
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
  if (!name) return fail("Enter the customer's name.");
  if (input.customerKey && !KEY_PATTERN.test(input.customerKey)) return fail("Unknown customer.");
  const startsAt = zonedToUtc(input.date, input.time, dealership.timeZone);
  if (!startsAt) return fail("Pick a date and time.");
  const durationMin = [30, 45, 60, 90, 120].includes(Number(input.durationMin)) ? Number(input.durationMin) : 60;
  const repId = input.repId ? Number(input.repId) : null;
  const phone = String(input.phone ?? "").replace(/\D/g, "").slice(-10) || null;

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
      customerKey: input.customerKey ?? (phone && phone.length === 10 ? `p-${phone}` : null),
      customerName: name,
      phone,
      vehicle: cleanName(input.vehicle, 80) || null,
      repId,
      startsAt,
      durationMin,
      notes: String(input.notes ?? "").slice(0, 1000),
    });
  } catch {
    return NO_DB;
  }
  revalidatePath("/appointments");
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { ok: true, message: `Booked for ${formatDateTime(startsAt.getTime())}.` };
}

export async function setAppointmentStatusAction(id: number, status: data.AppointmentStatus): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff) return fail("Your session ended. Sign in again.");
  if (!Number.isInteger(id) || !data.APPOINTMENT_STATUSES.some((s) => s.value === status)) return fail("Unknown appointment.");
  try { await data.setAppointmentStatus(id, status); } catch { return NO_DB; }
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  return { ok: true };
}
