// The update email to the dealership inbox: every so often (default 90 minutes, during the AI's working hours) AutoDash writes
// "these customers are waiting for you" (what they want, what was said, a link to talk to them) and sends ONE email to the dealership mailbox. Skipped when nobody is waiting.
import { aiHoursOpen } from "@/lib/ai/schedule";
import { canSendFrom } from "@/lib/auth/google";
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dataStartDate, dealership } from "@/lib/dealership";
import { withGmail } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";
import { digestBody, digestIsEmpty, digestSubject, type DigestData } from "./digest-format";

export type DigestSettings = { on: boolean; everyMin: number; to: string; anyTime: boolean; appointments: boolean; inventory: boolean };
export const DIGEST_EVERY = [30, 60, 90, 120, 180] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getDigestSettings(): Promise<DigestSettings> {
  const [on, every, to, anyTime, appts, inv] = await Promise.all(["digest_on", "digest_every", "digest_to", "digest_any_time", "digest_show_appointments", "digest_show_inventory"].map((k) => getSetting(k).catch(() => null)));
  const n = Number(every);
  return { on: on !== "off", everyMin: (DIGEST_EVERY as readonly number[]).includes(n) ? n : 90, to: to && EMAIL.test(to) ? to : "", anyTime: anyTime === "on", appointments: appts === "on", inventory: inv === "on" };
}
export async function saveDigestSettings(s: DigestSettings) {
  await setSetting("digest_on", s.on ? "on" : "off");
  await setSetting("digest_every", String(s.everyMin));
  await setSetting("digest_to", s.to.trim().toLowerCase());
  await setSetting("digest_any_time", s.anyTime ? "on" : "off");
  await setSetting("digest_show_appointments", s.appointments ? "on" : "off");
  await setSetting("digest_show_inventory", s.inventory ? "on" : "off");
}

export type DigestStatus = { at: number; sent: boolean; reason: string };
/** What happened the last time the timer looked at the update email (shown on the Automations page, so "nothing arrived" always has a reason). */
export async function getDigestStatus(): Promise<DigestStatus | null> {
  try { const raw = await getSetting("digest_status"); return raw ? (JSON.parse(raw) as DigestStatus) : null; } catch { return null; }
}
async function remember(result: DigestResult): Promise<DigestResult> {
  // "not due yet" happens on most timer runs; keeping it would hide the real reason from the last real check.
  if (result.reason !== "not due yet") await setSetting("digest_status", JSON.stringify({ at: Date.now(), ...result })).catch(() => undefined);
  return result;
}

const n = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

export async function gatherDigest(from: number, to: number): Promise<DigestData | null> {
  const sql = await readyDb();
  if (!sql) return null;
  // Everyone still waiting, not just people who arrived since the last email: a customer stays on the list until someone at the
  // dealership contacts them (marked on their profile) or removes them. Looks back 3 days.
  const since = new Date(Math.max(to - 72 * 3600_000, dataStartDate().getTime()));
  // Each query on its own: if one fails the update is still sent with the rest.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = Record<string, any>;
  const q = async (query: PromiseLike<unknown>): Promise<Row[]> => {
    try { return (await query) as Row[]; } catch (e) { console.error("[autodash:digest]", e instanceof Error ? e.message : e); return []; }
  };
  const [people, emails, texts, drafts, appts, newCars, soldCars] = await Promise.all([
    q(sql`select l.customer_key, l.name, l.phone, l.email, l.vehicle, l.provider, l.comments, l.received_at, c.contacted_at,
            r.status as reply_status, r.sent_at as reply_sent_at, r.body as reply_body
          from leads l left join customers c on c.key = l.customer_key left join ai_replies r on r.lead_id = l.message_id
          where not l.ignored and l.received_at >= ${since} order by l.received_at asc limit 60`),
    q(sql`select customer_key, from_email, body, received_at from customer_replies where received_at >= ${since} order by received_at asc limit 100`),
    q(sql`select customer_key, phone, body, created_at from sms_messages where direction = 'in' and created_at >= ${since} order by created_at asc limit 100`),
    q(sql`select count(*)::int as n from ai_replies where status = 'draft'`),
    q(sql`select customer_name, phone, vehicle, starts_at from appointments where status = 'scheduled' and starts_at between now() and now() + interval '24 hours' order by starts_at limit 15`),
    q(sql`select title from inventory where status = 'available' and first_seen >= ${since} order by first_seen limit 10`),
    q(sql`select title from inventory where status = 'sold' and sold_at >= ${since} order by sold_at limit 10`),
  ]);
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "") || null;
  const byCustomer = new Map<string, Row>();
  for (const r of people) { // newest message per customer; one entry per person
    const k = String(r.customer_key ?? r.email ?? r.phone ?? r.name ?? Math.random());
    const old = byCustomer.get(k);
    if (!old || n(r.received_at) >= n(old.received_at)) byCustomer.set(k, { ...r, _k: k, _first: old?._first ?? r.received_at });
    else byCustomer.set(k, { ...old, _first: old._first });
  }
  const waiting = [...byCustomer.values()].map((r) => {
    const key = r.customer_key ? String(r.customer_key) : null;
    const at = n(r._first ?? r.received_at);
    const replies = [
      ...emails.filter((e) => key && e.customer_key === key).map((e) => ({ via: "email" as const, text: String(e.body ?? ""), at: n(e.received_at) })),
      ...texts.filter((t) => (key && t.customer_key === key) || (r.phone && t.phone === r.phone)).map((t) => ({ via: "text" as const, text: String(t.body ?? ""), at: n(t.created_at) })),
    ].sort((x, y) => x.at - y.at);
    const contactedAt = n(r.contacted_at);
    return {
      name: r.name ?? null, phone: r.phone ?? null, email: r.email ?? null, vehicle: r.vehicle ?? null, provider: r.provider ?? null, message: r.comments ?? null,
      link: appUrl && key ? `${appUrl}/customers/${encodeURIComponent(key)}` : appUrl ? `${appUrl}/leads` : null,
      ai: r.reply_status === "sent" || r.reply_status === "sending" ? ("sent" as const) : r.reply_status === "draft" ? ("draft" as const) : ("none" as const),
      aiSentAt: r.reply_sent_at ? n(r.reply_sent_at) : null, aiText: r.reply_body ? String(r.reply_body) : null,
      replies: replies.filter((x) => x.at > contactedAt),
      at, _handled: contactedAt >= Math.max(at, ...replies.map((x) => x.at), 0) && contactedAt > 0,
    };
  }).filter((w) => !w._handled).map(({ _handled, ...w }) => { void _handled; return w; }).sort((a, b) => a.at - b.at).slice(0, 25);
  return {
    dealership: dealership.name, timeZone: dealership.timeZone, from, to, appUrl, waiting,
    draftsWaiting: Number(drafts[0]?.n ?? 0),
    appointments: appts.map((r) => ({ name: r.customer_name, phone: r.phone ?? null, vehicle: r.vehicle ?? null, at: n(r.starts_at) })),
    newCars: newCars.map((r) => String(r.title)),
    soldCars: soldCars.map((r) => String(r.title)),
  };
}

export type DigestResult = { sent: boolean; reason: string };

/** Called by the timer every 5 minutes. Sends at most one update per interval, only in the AI's working hours, only if something happened.
 *  `force` (the "Send one now" button) skips the schedule and the interval and sends even if nothing happened. */
export async function sendDigestIfDue(opts: { force?: boolean } = {}): Promise<DigestResult> {
  return remember(await runDigest(opts));
}

async function runDigest({ force = false } = {}): Promise<DigestResult> {
  const settings = await getDigestSettings();
  if (!settings.on && !force) return { sent: false, reason: "off" };
  const sql = await readyDb();
  if (!sql) return { sent: false, reason: "no database" };
  const connection = await loadGmailConnection(undefined);
  if (!connection || !canSendFrom(connection)) return { sent: false, reason: "Gmail can't send yet (reconnect Gmail in Settings)" };
  if (!force && !settings.anyTime && !(await aiHoursOpen())) return { sent: false, reason: "outside working hours" };

  const now = Date.now();
  const everyMs = settings.everyMin * 60_000;
  const prevRaw = await getSetting("digest_last").catch(() => null);
  const prev = prevRaw && /^\d+$/.test(prevRaw) ? Number(prevRaw) : null;
  if (!force && prev && now - prev < everyMs) return { sent: false, reason: "not due yet" };
  const from = Math.max(prev ?? now - everyMs, now - 24 * 3600_000);

  const data = await gatherDigest(from, now);
  if (data && !settings.appointments) data.appointments = [];
  if (data && !settings.inventory) { data.newCars = []; data.soldCars = []; }
  if (!data) return { sent: false, reason: "no database" };
  if (!force && digestIsEmpty(data)) return { sent: false, reason: "nobody is waiting" };

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
