// Registration stickers in the database: the list, changes, photos, the manager's reminder number, and the text that asks
// "did the registration come in?" a few weeks after a sale.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { sendSms, tenDigits, toE164, twilioConfigured } from "@/lib/sms/twilio";
import { cleanCopy, cleanStage, cleanWeeks, nextReminderAt, reminderDue, reminderText, type Copy, type Stage } from "./rules";

export type RegEvent = { at: number; by: string; text: string };
export type Reg = {
  id: number; customerKey: string | null; name: string | null; phone: string | null; vehicle: string | null; stage: Stage; copy: Copy; deferred: boolean; note: string;
  purchasedAt: number | null; reminders: number; reminderAt: number | null; hasPhoto: boolean; history: RegEvent[]; createdBy: string | null; createdAt: number; updatedAt: number;
};
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
const LIST = `id, customer_key, name, phone, vehicle, stage, copy, deferred, note, purchased_at, reminders, reminder_at, (photo is not null) as has_photo, history, created_by, created_at, updated_at`;
const toReg = (r: Record<string, unknown>): Reg => ({
  id: Number(r.id), customerKey: (r.customer_key as string) ?? null, name: (r.name as string) ?? null, phone: (r.phone as string) ?? null, vehicle: (r.vehicle as string) ?? null,
  stage: cleanStage(r.stage) ?? "waiting", copy: cleanCopy(r.copy) ?? "needed", deferred: Boolean(r.deferred), note: String(r.note ?? ""),
  purchasedAt: ms(r.purchased_at), reminders: Number(r.reminders ?? 0), reminderAt: ms(r.reminder_at), hasPhoto: Boolean(r.has_photo),
  history: (Array.isArray(r.history) ? r.history : []).slice(-30) as RegEvent[], createdBy: (r.created_by as string) ?? null,
  createdAt: ms(r.created_at) ?? 0, updatedAt: ms(r.updated_at) ?? 0,
});
const event = (by: string, text: string) => JSON.stringify([{ at: Date.now(), by, text }]);

// ---- settings: ONE manager number gets the reminder text ----
export type RegSettings = { on: boolean; phone: string; weeks: number };
export async function getRegSettings(): Promise<RegSettings> {
  const [on, phone, weeks] = await Promise.all([getSetting("registration_reminder").catch(() => null), getSetting("registration_phone").catch(() => null), getSetting("registration_weeks").catch(() => null)]);
  return { on: on !== "off", phone: phone ?? "", weeks: cleanWeeks(weeks) };
}
export async function saveRegSettings(s: RegSettings): Promise<string | null> {
  const phone = s.phone.trim();
  if (phone && !toE164(phone)) return "Enter a US phone number with 10 digits, or leave it blank.";
  if (phone && tenDigits(toE164(phone) ?? "") === tenDigits(String(process.env.TWILIO_PHONE_NUMBER ?? ""))) return "That is the AutoDash texting number itself. Use a phone the manager carries.";
  await setSetting("registration_reminder", s.on ? "on" : "off");
  await setSetting("registration_phone", phone);
  await setSetting("registration_weeks", String(cleanWeeks(s.weeks)));
  return null;
}

// ---- reading ----
/** Makes a "not here yet" entry for each customer marked purchased since this feature was switched on, so the registration for every new sale is tracked. */
export async function syncPurchases(): Promise<number> {
  const sql = await readyDb();
  if (!sql) return 0;
  let start = Number(await getSetting("registration_start").catch(() => null)) || 0;
  if (!start) { start = Date.now() - 2 * 86_400_000; await setSetting("registration_start", String(start)).catch(() => undefined); }
  const rows = await sql`insert into registrations (customer_key, name, phone, vehicle, purchased_at, created_by, history)
    select c.key, c.name, c.phone, coalesce(c.purchased_vehicle, c.last_vehicle), c.purchased_at, 'AutoDash', ${event("AutoDash", "Added automatically when the car was sold")}::jsonb
    from customers c where c.status = 'purchased' and c.purchased_at >= ${new Date(start)}
      and not exists (select 1 from registrations r where r.customer_key = c.key and r.purchased_at is not null and abs(extract(epoch from (r.purchased_at - c.purchased_at))) < 86400 * 3)
    returning id`;
  return rows.length;
}

export async function listRegistrations(): Promise<Reg[]> {
  const sql = await readyDb();
  if (!sql) return [];
  return (await sql.unsafe(`select ${LIST} from registrations order by (stage = 'done') asc, coalesce(purchased_at, created_at) desc limit 500`)).map(toReg);
}

export async function registrationCounts(): Promise<{ waiting: number; pickup: number; copy: number; deferred: number; open: number }> {
  const sql = await readyDb();
  const none = { waiting: 0, pickup: 0, copy: 0, deferred: 0, open: 0 };
  if (!sql) return none;
  const [c] = await sql`select count(*) filter (where stage = 'waiting')::int as waiting, count(*) filter (where stage = 'pickup')::int as pickup,
    count(*) filter (where copy = 'needed' and stage in ('pickup', 'picked'))::int as copy, count(*) filter (where deferred and stage <> 'done')::int as deferred,
    count(*) filter (where stage <> 'done')::int as open from registrations`.catch(() => [none]);
  return c as typeof none;
}

export async function getPhoto(id: number, thumb: boolean): Promise<{ data: Buffer; type: string } | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [r] = await sql`select photo, thumb, photo_type from registrations where id = ${id}`;
  const data = (thumb ? r?.thumb ?? r?.photo : r?.photo) as Buffer | null | undefined;
  return data ? { data: Buffer.from(data), type: String(r.photo_type || "image/jpeg") } : null;
}

// ---- changes ----
export async function createRegistration(i: { purchasedAt?: Date | null; name: string; phone: string; vehicle: string; deferred: boolean; note: string; photo?: Buffer | null; thumb?: Buffer | null; type?: string; by: string }): Promise<number> {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const phone = tenDigits(toE164(i.phone) ?? "") || i.phone.replace(/\D/g, "").slice(0, 15) || null;
  // A phone number we already know links the sticker to that customer.
  const [known] = phone ? await sql`select key, name, last_vehicle, purchased_vehicle from customers where phone = ${phone} or key = ${`p-${phone}`} limit 1` : [];
  const stage: Stage = i.photo ? "pickup" : "waiting";
  const [r] = await sql`insert into registrations (customer_key, name, phone, vehicle, stage, deferred, note, photo, thumb, photo_type, created_by, history, purchased_at)
    values (${known?.key ?? null}, ${i.name || known?.name || null}, ${phone}, ${i.vehicle || known?.purchased_vehicle || known?.last_vehicle || null}, ${stage}, ${i.deferred}, ${i.note}, ${i.photo ?? null}, ${i.thumb ?? null}, ${i.type ?? null}, ${i.by},
      ${event(i.by, i.photo ? "Added with a photo" : "Added")}::jsonb, ${i.purchasedAt ?? null}) returning id`;
  return Number(r.id);
}

export async function attachPhoto(id: number, photo: Buffer, thumb: Buffer | null, type: string, by: string): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const rows = await sql`update registrations set photo = ${photo}, thumb = ${thumb}, photo_type = ${type}, stage = case when stage = 'waiting' then 'pickup' else stage end,
    history = history || ${event(by, "Photo added")}::jsonb, updated_at = now() where id = ${id} returning id`;
  return rows.length > 0;
}

export async function setStage(id: number, stage: Stage, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const labels: Record<Stage, string> = { waiting: "Not here yet", pickup: "Needs pickup", picked: "Picked up", done: "Done" };
  await sql`update registrations set stage = ${stage}, history = history || ${event(by, `Marked: ${labels[stage]}`)}::jsonb, updated_at = now() where id = ${id}`;
}
export async function setCopy(id: number, copy: Copy, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const labels: Record<Copy, string> = { needed: "Copy needed", made: "Copy made", none: "No copy needed" };
  await sql`update registrations set copy = ${copy}, history = history || ${event(by, labels[copy])}::jsonb, updated_at = now() where id = ${id}`;
}
export async function setDeferred(id: number, on: boolean, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update registrations set deferred = ${on}, history = history || ${event(by, on ? "Marked deferred payment" : "Deferred payment cleared")}::jsonb, updated_at = now() where id = ${id}`;
}
export async function editDetails(id: number, d: { name: string; phone: string; vehicle: string; note: string }, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const phone = tenDigits(toE164(d.phone) ?? "") || d.phone.replace(/\D/g, "").slice(0, 15) || null;
  await sql`update registrations set name = ${d.name || null}, phone = ${phone}, vehicle = ${d.vehicle || null}, note = ${d.note}, history = history || ${event(by, "Details edited")}::jsonb, updated_at = now() where id = ${id}`;
}
export async function deleteRegistration(id: number) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`delete from registrations where id = ${id}`;
}

// ---- the reminder text to the manager ----
const base = () => (process.env.APP_URL || "https://auto-one-dealer.vercel.app").replace(/\/$/, "");
const shortDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: dealership.timeZone });

/** Texts the one manager number about sales whose registration hasn't come in yet. Sends at most `max` per run. */
export async function sendRegistrationReminders({ max = 3 } = {}): Promise<{ sent: number; waiting: string | null }> {
  const sql = await readyDb();
  if (!sql) return { sent: 0, waiting: "No database." };
  await syncPurchases().catch(() => 0);
  const s = await getRegSettings();
  if (!s.on) return { sent: 0, waiting: "Reminders are off." };
  const to = toE164(s.phone);
  if (!to) return { sent: 0, waiting: "No manager number is set." };
  if (!twilioConfigured()) return { sent: 0, waiting: "Twilio isn't connected yet." };
  const rows = await sql`select id, name, vehicle, purchased_at, reminders, reminder_at from registrations
    where stage = 'waiting' and purchased_at is not null and reminders < 2 order by purchased_at asc limit 40`;
  let sent = 0;
  for (const r of rows) {
    if (sent >= max) break;
    const purchasedAt = new Date(r.purchased_at).getTime();
    const lastAt = r.reminder_at ? new Date(r.reminder_at).getTime() : null;
    if (!reminderDue({ purchasedAt, weeks: s.weeks, sent: Number(r.reminders), lastAt, now: Date.now() })) continue;
    // Claim it first so two timer runs can't both text.
    const claimed = await sql`update registrations set reminders = reminders + 1, reminder_at = now(), history = history || ${event("AutoDash", "Texted the manager to ask if it came in")}::jsonb
      where id = ${r.id} and reminders = ${r.reminders} returning id`;
    if (!claimed.length) continue;
    try {
      await sendSms(to, reminderText({ name: r.name ?? null, car: r.vehicle ?? null, boughtOn: shortDay(purchasedAt), link: `${base()}/registration`, second: Number(r.reminders) >= 1 }));
      sent++;
    } catch (error) {
      await sql`update registrations set reminders = ${r.reminders}, reminder_at = ${r.reminder_at}, history = history || ${event("AutoDash", `Reminder text failed: ${error instanceof Error ? error.message : "unknown"}`.slice(0, 160))}::jsonb where id = ${r.id}`;
    }
  }
  return { sent, waiting: null };
}

/** For the Follow-ups page: reminders that are coming and ones that went out. */
export type RegFollowup = { id: number; name: string | null; vehicle: string | null; at: number; state: "scheduled" | "sent" };
export async function registrationFollowups(): Promise<RegFollowup[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const s = await getRegSettings();
  const rows = await sql`select id, name, vehicle, purchased_at, reminders, reminder_at, stage from registrations where purchased_at is not null and (reminders > 0 or stage = 'waiting') order by purchased_at desc limit 200`;
  const out: RegFollowup[] = [];
  for (const r of rows) {
    const purchasedAt = new Date(r.purchased_at).getTime();
    const lastAt = r.reminder_at ? new Date(r.reminder_at).getTime() : null;
    if (r.reminders > 0 && lastAt) out.push({ id: Number(r.id), name: r.name ?? null, vehicle: r.vehicle ?? null, at: lastAt, state: "sent" });
    if (r.stage === "waiting") {
      const next = nextReminderAt({ purchasedAt, weeks: s.weeks, sent: Number(r.reminders), lastAt });
      if (next) out.push({ id: Number(r.id), name: r.name ?? null, vehicle: r.vehicle ?? null, at: next, state: "scheduled" });
    }
  }
  return out;
}
