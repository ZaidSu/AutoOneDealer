// The update email to the dealership inbox: every so often (default 90 minutes, during the AI's working hours) AutoDash writes
// "here is what happened, contact these people" and sends it to the dealership mailbox. Skipped when nothing happened.
import { aiHoursOpen } from "@/lib/ai/schedule";
import { canSendFrom } from "@/lib/auth/google";
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dataStartDate, dealership } from "@/lib/dealership";
import { withGmail } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";
import { digestBody, digestIsEmpty, digestSubject, type DigestData } from "./digest-format";

export type DigestSettings = { on: boolean; everyMin: number; to: string };
export const DIGEST_EVERY = [30, 60, 90, 120, 180] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getDigestSettings(): Promise<DigestSettings> {
  const [on, every, to] = await Promise.all([getSetting("digest_on"), getSetting("digest_every"), getSetting("digest_to")].map((p) => p.catch(() => null)));
  const n = Number(every);
  return { on: on !== "off", everyMin: (DIGEST_EVERY as readonly number[]).includes(n) ? n : 90, to: to && EMAIL.test(to) ? to : "" };
}
export async function saveDigestSettings(s: DigestSettings) {
  await setSetting("digest_on", s.on ? "on" : "off");
  await setSetting("digest_every", String(s.everyMin));
  await setSetting("digest_to", s.to.trim().toLowerCase());
}

const n = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

async function gather(from: number, to: number): Promise<DigestData | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const since = new Date(Math.max(from, dataStartDate().getTime()));
  // Each query on its own: if one fails the update is still sent with the rest.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = Record<string, any>;
  const q = async (query: PromiseLike<unknown>): Promise<Row[]> => {
    try { return (await query) as Row[]; } catch (e) { console.error("[autodash:digest]", e instanceof Error ? e.message : e); return []; }
  };
  const [people, sent, drafts, emails, texts, appts, newCars, soldCars] = await Promise.all([
    q(sql`select l.name, l.phone, l.email, l.vehicle, l.provider, l.comments, l.received_at, c.contacted_at,
            r.status as reply_status, r.sent_at as reply_sent_at
          from leads l left join customers c on c.key = l.customer_key left join ai_replies r on r.lead_id = l.message_id
          where not l.ignored and l.received_at >= ${since} order by l.received_at asc limit 30`),
    q(sql`select customer_name, to_email, vehicle, sent_at, sent_by from ai_replies where status = 'sent' and sent_at >= ${since} order by sent_at asc limit 30`),
    q(sql`select count(*)::int as n from ai_replies where status = 'draft'`),
    q(sql`select from_name, from_email, body, received_at from customer_replies where received_at >= ${since} order by received_at asc limit 20`),
    q(sql`select m.phone, m.body, m.created_at, c.name from sms_messages m left join customers c on c.key = m.customer_key
          where m.direction = 'in' and m.created_at >= ${since} order by m.created_at asc limit 20`),
    q(sql`select customer_name, phone, vehicle, starts_at from appointments where status = 'scheduled' and starts_at between now() and now() + interval '24 hours' order by starts_at limit 15`),
    q(sql`select title from inventory where status = 'available' and first_seen >= ${since} order by first_seen limit 10`),
    q(sql`select title from inventory where status = 'sold' and sold_at >= ${since} order by sold_at limit 10`),
  ]);
  return {
    dealership: dealership.name, timeZone: dealership.timeZone, from, to, appUrl: (process.env.APP_URL ?? "").replace(/\/+$/, "") || null,
    newPeople: people.map((r) => ({
      name: r.name ?? null, phone: r.phone ?? null, email: r.email ?? null, vehicle: r.vehicle ?? null, provider: r.provider ?? null, message: r.comments ?? null,
      contacted: Boolean(r.contacted_at && n(r.contacted_at) >= n(r.received_at)),
      ai: r.reply_status === "sent" || r.reply_status === "sending" ? "sent" : r.reply_status === "draft" ? "draft" : "none",
      aiSentAt: r.reply_sent_at ? n(r.reply_sent_at) : null, at: n(r.received_at),
    })),
    wroteBack: [
      ...emails.map((r) => ({ name: r.from_name ?? null, via: "email" as const, phone: null, email: r.from_email ?? null, text: String(r.body ?? ""), at: n(r.received_at) })),
      ...texts.map((r) => ({ name: r.name ?? null, via: "text" as const, phone: r.phone ?? null, email: null, text: String(r.body ?? ""), at: n(r.created_at) })),
    ].sort((a, b) => a.at - b.at),
    aiSent: sent.map((r) => ({ name: r.customer_name ?? null, email: r.to_email, vehicle: r.vehicle ?? null, at: n(r.sent_at), auto: /automatic/i.test(String(r.sent_by ?? "")) })),
    draftsWaiting: Number(drafts[0]?.n ?? 0),
    appointments: appts.map((r) => ({ name: r.customer_name, phone: r.phone ?? null, vehicle: r.vehicle ?? null, at: n(r.starts_at) })),
    newCars: newCars.map((r) => String(r.title)),
    soldCars: soldCars.map((r) => String(r.title)),
  };
}

export type DigestResult = { sent: boolean; reason: string };

/** Called by the timer every 5 minutes. Sends at most one update per interval, only in the AI's working hours, only if something happened.
 *  `force` (the "Send one now" button) skips the schedule and the interval and sends even if nothing happened. */
export async function sendDigestIfDue({ force = false } = {}): Promise<DigestResult> {
  const settings = await getDigestSettings();
  if (!settings.on && !force) return { sent: false, reason: "off" };
  const sql = await readyDb();
  if (!sql) return { sent: false, reason: "no database" };
  const connection = await loadGmailConnection(undefined);
  if (!connection || !canSendFrom(connection)) return { sent: false, reason: "Gmail can't send yet (reconnect Gmail in Settings)" };
  if (!force && !(await aiHoursOpen())) return { sent: false, reason: "outside working hours" };

  const now = Date.now();
  const everyMs = settings.everyMin * 60_000;
  const prevRaw = await getSetting("digest_last").catch(() => null);
  const prev = prevRaw && /^\d+$/.test(prevRaw) ? Number(prevRaw) : null;
  if (!force && prev && now - prev < everyMs) return { sent: false, reason: "not due yet" };
  const from = Math.max(prev ?? now - everyMs, now - 24 * 3600_000);

  const data = await gather(from, now);
  if (!data) return { sent: false, reason: "no database" };
  if (!force && digestIsEmpty(data)) return { sent: false, reason: "nothing new" };

  // Claim this slot first (only one server can), so two timer runs never send the same update twice.
  const claimed = await sql`insert into app_settings (key, value) values ('digest_last', ${String(now)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
    ${force ? sql`` : sql`where app_settings.value::bigint <= ${now - everyMs}`} returning key`;
  if (claimed.length === 0) return { sent: false, reason: "already sent by another run" };

  const to = settings.to || connection.mailbox;
  const result = await withGmail((gmail) => gmail.send({ to, subject: digestSubject(data), body: digestBody(data), fromName: `${dealership.name} AutoDash` }), connection, "background");
  if (result.status !== "ok") {
    // Put the old time back so the next run tries again.
    if (prevRaw) await setSetting("digest_last", prevRaw).catch(() => undefined); else await setSetting("digest_last", null).catch(() => undefined);
    return { sent: false, reason: result.status === "error" ? result.message : "Gmail isn't connected" };
  }
  return { sent: true, reason: `sent to ${to}` };
}
