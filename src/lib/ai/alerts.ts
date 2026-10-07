// Extra automations that email the dealership inbox, each with its own switch and settings (AI > Automations):
//  - Waiting-customer alert: a new customer nobody has contacted for N minutes.
//  - Morning briefing: once a day at the chosen hour: today's appointments, who is still waiting, AI replies waiting for approval.
//  - Inventory problem alert: the website inventory hasn't been read successfully for a few hours (so the AI can't check cars).
// Subjects never contain the words "lead" or "loan app", so AutoDash's own import can't mistake these emails for a customer.
import { aiHoursOpen } from "@/lib/ai/schedule";
import { canSendFrom } from "@/lib/auth/google";
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dataStartDate, dealership } from "@/lib/dealership";
import { withGmail } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";
import { getSyncState } from "@/lib/inventory/store";
import { dayKey } from "@/lib/utils/time";
import { prettyPhone } from "./digest-format";

export type AlertSettings = {
  waiting: { on: boolean; minutes: number };
  morning: { on: boolean; hour: number };
  inventory: { on: boolean; hours: number };
  to: string;
};
export const WAITING_MINUTES = [30, 60, 120, 240] as const;
export const INVENTORY_HOURS = [2, 4, 8, 12] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEFAULT_ALERTS: AlertSettings = { waiting: { on: true, minutes: 60 }, morning: { on: true, hour: 9 }, inventory: { on: true, hours: 4 }, to: "" };

export function cleanAlertSettings(input: unknown): AlertSettings {
  const r = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof AlertSettings, Record<string, unknown> | string>>;
  const w = (r.waiting ?? {}) as Record<string, unknown>;
  const m = (r.morning ?? {}) as Record<string, unknown>;
  const i = (r.inventory ?? {}) as Record<string, unknown>;
  const pick = <T extends number>(list: readonly T[], v: unknown, d: T): T => (list as readonly number[]).includes(Number(v)) ? (Number(v) as T) : d;
  const hour = Math.round(Number(m.hour));
  const to = typeof r.to === "string" ? r.to.trim().toLowerCase() : "";
  return {
    waiting: { on: w.on !== false, minutes: pick(WAITING_MINUTES, w.minutes, 60) },
    morning: { on: m.on !== false, hour: hour >= 5 && hour <= 12 ? hour : 9 },
    inventory: { on: i.on !== false, hours: pick(INVENTORY_HOURS, i.hours, 4) },
    to: EMAIL.test(to) ? to : "",
  };
}

export async function getAlertSettings(): Promise<AlertSettings> {
  try { const raw = await getSetting("alert_settings"); return raw ? cleanAlertSettings(JSON.parse(raw)) : DEFAULT_ALERTS; } catch { return DEFAULT_ALERTS; }
}
export async function saveAlertSettings(s: AlertSettings) { await setSetting("alert_settings", JSON.stringify(s)); }

const clock = (ms: number, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const hourIn = (ms: number, tz: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date(ms)).replace(/^24$/, "0"));
const ago = (ms: number) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60_000)); return m < 90 ? `${m} min` : `${Math.round(m / 60)} hours`; };
const t = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function waitingBody(rows: { name: string | null; phone: string | null; email: string | null; vehicle: string | null; provider: string | null; at: number }[], tz: string, appUrl: string | null): string {
  const out = [`${dealership.name}: these customers have been waiting for someone to contact them`, ""];
  rows.forEach((p, i) => {
    const how = [p.phone ? prettyPhone(p.phone) : null, p.email].filter(Boolean).join(", ") || "no phone or email given (answer in the listing app)";
    out.push(`${i + 1}. ${p.name?.trim() || "Name not given"} (${how})`);
    out.push(`   ${p.provider ?? "A listing site"}${p.vehicle ? `, asked about the ${p.vehicle}` : ""}, ${clock(p.at, tz)} (${ago(p.at)} ago)`);
  });
  out.push("", "Open the customer in AutoDash and tap 'Contacted' once someone has reached out, so this stops.");
  if (appUrl) out.push(appUrl);
  out.push("(Sent automatically by AutoDash. Change or turn off under AI > Automations.)");
  return out.join("\n");
}

export function morningBody(d: { appointments: { name: string; phone: string | null; vehicle: string | null; at: number }[]; waiting: number; drafts: number; cars: number | null }, tz: string, appUrl: string | null): string {
  const out = [`${dealership.name}: good morning`, ""];
  out.push(d.appointments.length ? `TODAY'S APPOINTMENTS (${d.appointments.length})` : "No appointments booked for today.");
  for (const a of d.appointments) out.push(`- ${clock(a.at, tz)}: ${a.name}${a.phone ? ` ${prettyPhone(a.phone)}` : ""}${a.vehicle ? `, ${a.vehicle}` : ""}`);
  out.push("");
  out.push(`Customers still waiting for someone to contact them: ${d.waiting}`);
  out.push(`AI replies waiting for your OK: ${d.drafts}`);
  if (d.cars != null) out.push(`Cars on the lot in AutoDash: ${d.cars}`);
  if (appUrl) out.push("", appUrl);
  out.push("(Sent automatically by AutoDash. Change or turn off under AI > Automations.)");
  return out.join("\n");
}

async function send(subject: string, body: string, toOverride: string): Promise<"ok" | string> {
  const connection = await loadGmailConnection(undefined);
  if (!connection || !canSendFrom(connection)) return "Gmail can't send yet (reconnect Gmail in Settings)";
  const result = await withGmail((g) => g.send({ to: toOverride || connection.mailbox, subject, body, fromName: `${dealership.name} AutoDash` }), connection, "background");
  return result.status === "ok" ? "ok" : result.status === "error" ? result.message : "Gmail isn't connected";
}

/** Called by the timer. Never throws; each automation is independent. Returns what it sent, for the timer's report. */
export async function runAlerts({ forceMorning = false } = {}): Promise<{ waiting?: string; morning?: string; inventory?: string }> {
  const out: { waiting?: string; morning?: string; inventory?: string } = {};
  const s = await getAlertSettings();
  const sql = await readyDb();
  if (!sql) return out;
  const tz = dealership.timeZone;
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "") || null;
  const now = Date.now();
  const open = await aiHoursOpen().catch(() => true);

  // 1. Waiting customers
  try {
    if (s.waiting.on && open) {
      const seenRaw = await getSetting("alert_waiting_seen").catch(() => null);
      const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
      const since = new Date(Math.max(now - 24 * 3600_000, dataStartDate().getTime()));
      const rows = (await sql`select l.message_id, l.name, l.phone, l.email, l.vehicle, l.provider, l.received_at
          from leads l left join customers c on c.key = l.customer_key
          where not l.ignored and l.name is not null and trim(l.name) <> '' and l.received_at >= ${since} and l.received_at <= ${new Date(now - s.waiting.minutes * 60_000)}
            and (c.contacted_at is null or c.contacted_at < l.received_at)
          order by l.received_at asc limit 15`) as Row[];
      const fresh = rows.filter((r) => !seen.includes(String(r.message_id)));
      if (fresh.length) {
        const res = await send(`${fresh.length} customer${fresh.length === 1 ? " is" : "s are"} waiting for a reply`, waitingBody(fresh.map((r) => ({ name: r.name ?? null, phone: r.phone ?? null, email: r.email ?? null, vehicle: r.vehicle ?? null, provider: r.provider ?? null, at: t(r.received_at) })), tz, appUrl), s.to);
        if (res === "ok") { await setSetting("alert_waiting_seen", JSON.stringify([...seen, ...fresh.map((r) => String(r.message_id))].slice(-300))); out.waiting = `${fresh.length} waiting`; }
        else out.waiting = `failed: ${res}`;
      }
    }
  } catch (e) { out.waiting = `failed: ${e instanceof Error ? e.message : "unknown"}`; }

  // 2. Morning briefing (once a day, from the chosen hour; if the timer was late it still goes out that morning)
  try {
    const today = dayKey(now, tz);
    if ((s.morning.on || forceMorning) && (forceMorning || (hourIn(now, tz) >= s.morning.hour && hourIn(now, tz) < 13)) && (forceMorning || (await getSetting("alert_morning_day").catch(() => null)) !== today)) {
      const start = new Date(now - 12 * 3600_000);
      const end = new Date(now + 14 * 3600_000);
      const [appts, waiting, drafts, cars] = await Promise.all([
        sql`select customer_name, phone, vehicle, starts_at from appointments where status = 'scheduled' and starts_at between ${start} and ${end} order by starts_at`.catch(() => []) as Promise<Row[]>,
        sql`select count(*)::int as n from leads l left join customers c on c.key = l.customer_key where not l.ignored and l.name is not null and l.received_at >= ${new Date(Math.max(now - 48 * 3600_000, dataStartDate().getTime()))} and (c.contacted_at is null or c.contacted_at < l.received_at)`.catch(() => [{ n: 0 }]) as Promise<Row[]>,
        sql`select count(*)::int as n from ai_replies where status = 'draft'`.catch(() => [{ n: 0 }]) as Promise<Row[]>,
        sql`select count(*)::int as n from inventory where status = 'available'`.catch(() => [{ n: null }]) as Promise<Row[]>,
      ]);
      const todays = appts.filter((a) => dayKey(t(a.starts_at), tz) === today);
      const res = await send(`Good morning: ${todays.length} appointment${todays.length === 1 ? "" : "s"} today, ${Number(waiting[0]?.n ?? 0)} waiting`,
        morningBody({ appointments: todays.map((a) => ({ name: a.customer_name, phone: a.phone ?? null, vehicle: a.vehicle ?? null, at: t(a.starts_at) })), waiting: Number(waiting[0]?.n ?? 0), drafts: Number(drafts[0]?.n ?? 0), cars: cars[0]?.n == null ? null : Number(cars[0].n) }, tz, appUrl), s.to);
      if (res === "ok") { if (!forceMorning) await setSetting("alert_morning_day", today); out.morning = "morning briefing sent"; }
      else out.morning = `failed: ${res}`;
    }
  } catch (e) { out.morning = `failed: ${e instanceof Error ? e.message : "unknown"}`; }

  // 3. Inventory problem
  try {
    if (s.inventory.on) {
      const state = await getSyncState();
      const lastGood = state?.ok ? state.at : Number((await getSetting("inventory_last_good").catch(() => null)) ?? 0) || null;
      const stuck = state && !state.ok && (!lastGood || now - lastGood > s.inventory.hours * 3600_000) && now - state.at < 3600_000;
      const last = Number((await getSetting("alert_inventory_at").catch(() => null)) ?? 0);
      if (stuck && now - last > 12 * 3600_000) {
        const res = await send("AutoDash can't read your website's cars right now",
          `The AI can't check whether a car is still available because AutoDash hasn't been able to read ${dealership.name}'s website inventory for over ${s.inventory.hours} hours.\n\nLast error: ${state?.error ?? "unknown"}\n\nUntil it's fixed the AI tells customers a salesperson will confirm. Open Inventory in AutoDash and click "Check website now", or paste the website text there.${appUrl ? `\n${appUrl}/inventory` : ""}\n(Sent automatically by AutoDash. Change or turn off under AI > Automations.)`, s.to);
        if (res === "ok") { await setSetting("alert_inventory_at", String(now)); out.inventory = "inventory alert sent"; } else out.inventory = `failed: ${res}`;
      }
    }
  } catch (e) { out.inventory = `failed: ${e instanceof Error ? e.message : "unknown"}`; }
  return out;
}
