// The To do list: what needs a person at the dealership right now. Worked out fresh each time from data AutoDash already
// has (customers, leads, texts, emails, appointments). Only "done" and "snoozed" are saved, per item, so a new reply or a
// new lead on the same customer makes it show up again.
import { dealership, dataStartDate } from "@/lib/dealership";
import { readyDb } from "@/lib/db";
import { formatMoney } from "@/lib/utils/format";
import { cached, dropCached } from "@/lib/utils/cache";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";
import { ago, isKeywordOnly, LABEL, mergeRows, snippet, stateKey, WEIGHT, wantsToBuy, type Reason, type TodoReason, type TodoRow } from "./todo-rules";

export type { TodoRow, TodoReason } from "./todo-rules";
const tz = dealership.timeZone;
const HUMAN_CONTACT = ["call", "text", "email", "visit", "voicemail"];
const MIN_AGE_MS = 30 * 60_000; // give the AI and the team half an hour before a new lead shows up here
const REPLY_MIN_AGE_MS = 10 * 60_000;

type Flat = Parameters<typeof mergeRows>[0][number];

/** Worked out at most once every 30 seconds (the sidebar number, the dashboard and the To do page all ask for it). */
export function getTodos(): Promise<{ rows: TodoRow[]; problems: string[] }> {
  return cached("todos", 30_000, computeTodos);
}

async function computeTodos(): Promise<{ rows: TodoRow[]; problems: string[] }> {
  const sql = await readyDb();
  if (!sql) return { rows: [], problems: ["The database isn't connected."] };
  const now = Date.now();
  const start = dataStartDate();
  const today = dayKey(now, tz);
  const problems: string[] = [];
  const flat: Flat[] = [];
  const reason = (r: Reason, detail: string, since: number, token: string, weight: number, hot = false): TodoReason => ({ reason: r, label: LABEL[r], detail, since, token, weight, hot });
  const part = async (label: string, work: () => Promise<void>) => { try { await work(); } catch (error) { problems.push(label); console.error(`[autodash:todo] ${label} failed:`, error instanceof Error ? error.message : error); } };

  await Promise.all([
    // Follow-up date reached
    part("follow-up dates", async () => {
      const rows = await sql`select key, name, phone, last_vehicle, follow_up_at::text as day from customers
        where follow_up_at is not null and follow_up_at <= ${today}::date and status <> 'purchased' order by follow_up_at limit 100`;
      for (const r of rows) {
        const day = String(r.day);
        const late = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400_000);
        const since = zonedToUtc(day, "09:00", tz)?.getTime() ?? now;
        flat.push({ id: r.key, customerKey: r.key, name: r.name, phone: r.phone, vehicle: r.last_vehicle,
          reason: reason("callback", late <= 0 ? "Your reminder to follow up is today." : `Your reminder to follow up was ${late} day${late === 1 ? "" : "s"} ago.`, since, day, WEIGHT.callback) });
      }
    }),
    // New leads that nobody has contacted
    part("new leads", async () => {
      const rows = await sql`select c.key, c.name, c.phone, c.last_vehicle, c.last_seen from customers c
        where c.status = 'new' and c.contacted_at is null and c.last_seen >= ${new Date(Math.max(now - 14 * 86400_000, start.getTime()))} and c.last_seen <= ${new Date(now - MIN_AGE_MS)}
          and not exists (select 1 from activities a where a.customer_key = c.key and a.created_at >= c.last_seen and a.kind = any(${HUMAN_CONTACT})
            and a.staff is not null and a.staff !~* '^AI' and a.body !~ '^Replied by email')
        order by c.last_seen limit 100`;
      for (const r of rows) {
        const at = new Date(r.last_seen).getTime();
        flat.push({ id: r.key, customerKey: r.key, name: r.name, phone: r.phone, vehicle: r.last_vehicle,
          reason: reason("new_lead", `Came in ${ago(at, now)}. Nobody on the team has contacted them yet.`, at, String(at), WEIGHT.newLead) });
      }
    }),
    // Credit applications nobody followed up on
    part("credit applications", async () => {
      const rows = await sql`select distinct on (l.customer_key) l.customer_key, l.name, l.phone, l.vehicle, l.loan_amount, l.received_at, l.message_id from leads l
        where l.kind = 'application' and not l.ignored and l.customer_key is not null
          and l.received_at >= ${new Date(Math.max(now - 7 * 86400_000, start.getTime()))} and l.received_at <= ${new Date(now - MIN_AGE_MS)}
          and not exists (select 1 from activities a where a.customer_key = l.customer_key and a.created_at >= l.received_at and a.kind = any(${HUMAN_CONTACT})
            and a.staff is not null and a.staff !~* '^AI' and a.body !~ '^Replied by email')
          and not exists (select 1 from customers c where c.key = l.customer_key and c.contacted_at >= l.received_at)
        order by l.customer_key, l.received_at desc limit 100`;
      for (const r of rows) {
        const at = new Date(r.received_at).getTime();
        const loan = r.loan_amount != null && Number(r.loan_amount) > 0 ? `, loan ${formatMoney(Number(r.loan_amount))}` : "";
        flat.push({ id: r.customer_key, customerKey: r.customer_key, name: r.name, phone: r.phone, vehicle: r.vehicle,
          reason: reason("application", `Applied for financing ${ago(at, now)}${loan}. Call to go over it.`, at, String(r.message_id).slice(0, 40), WEIGHT.application) });
      }
    }),
    // Customers who wrote back (email or text) and nobody has answered
    part("customer replies", async () => {
      const since = new Date(Math.max(now - 7 * 86400_000, start.getTime()));
      const [emails, texts] = await Promise.all([
        sql`select distinct on (customer_key) customer_key, received_at as at, body, subject from customer_replies
          where customer_key is not null and received_at >= ${since} order by customer_key, received_at desc`,
        sql`select distinct on (customer_key) customer_key, coalesce(sent_at, created_at) as at, body from sms_messages
          where direction = 'in' and customer_key is not null and created_at >= ${since} order by customer_key, created_at desc`,
      ]);
      const last = new Map<string, { at: number; body: string; via: string }>();
      const take = (key: string, at: number, body: string, via: string) => { const cur = last.get(key); if (!cur || at > cur.at) last.set(key, { at, body, via }); };
      for (const r of emails) { const body = String(r.body || r.subject || ""); if (!isKeywordOnly(body)) take(r.customer_key, new Date(r.at).getTime(), body, "email"); }
      for (const r of texts) { const body = String(r.body || ""); if (!isKeywordOnly(body)) take(r.customer_key, new Date(r.at).getTime(), body, "text"); }
      const keys = [...last.keys()];
      if (!keys.length) return;
      const answered = await sql`select customer_key, max(created_at) as at from activities
        where customer_key = any(${keys}) and kind = any(${HUMAN_CONTACT}) and body !~ '^Replied by email' group by customer_key`;
      const answeredAt = new Map(answered.map((r) => [r.customer_key as string, new Date(r.at).getTime()]));
      const names = await sql`select key, name, phone, last_vehicle from customers where key = any(${keys})`;
      const info = new Map(names.map((r) => [r.key as string, r]));
      for (const [key, m] of last) {
        if (now - m.at < REPLY_MIN_AGE_MS) continue;
        if ((answeredAt.get(key) ?? 0) >= m.at) continue; // someone (or the AI) already answered
        const c = info.get(key);
        const hot = wantsToBuy(m.body);
        flat.push({ id: key, customerKey: key, name: c?.name ?? null, phone: c?.phone ?? null, vehicle: c?.last_vehicle ?? null,
          reason: reason("replied", `Wrote back by ${m.via} ${ago(m.at, now)}: “${snippet(m.body)}”${hot ? " (sounds ready to move)" : ""}`, m.at, String(m.at), hot ? WEIGHT.repliedHot : WEIGHT.replied, hot) });
      }
    }),
    // Appointments today and tomorrow (confirm), and recent no-shows
    part("appointments", async () => {
      const tomorrowEnd = zonedToUtc(addDays(today, 2), "00:00", tz)!;
      const todayEnd = zonedToUtc(addDays(today, 1), "00:00", tz)!;
      const rows = await sql`select id, customer_key, customer_name, phone, vehicle, starts_at, status from appointments
        where (status = 'scheduled' and starts_at >= ${new Date(now - 30 * 60_000)} and starts_at < ${tomorrowEnd})
           or (status = 'no_show' and not coalesce(followed_up, false) and starts_at >= ${new Date(now - 3 * 86400_000)})
        order by starts_at limit 100`;
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
      const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
      for (const r of rows) {
        const at = new Date(r.starts_at).getTime();
        const id = r.customer_key || `appt-${r.id}`;
        if (r.status === "no_show") {
          flat.push({ id, customerKey: r.customer_key ?? null, name: r.customer_name, phone: r.phone, vehicle: r.vehicle,
            reason: reason("no_show", `Missed their appointment on ${dayFmt.format(at)}. Call to reschedule.`, at, String(r.id), WEIGHT.noShow) });
        } else {
          const isToday = at < todayEnd.getTime();
          flat.push({ id, customerKey: r.customer_key ?? null, name: r.customer_name, phone: r.phone, vehicle: r.vehicle,
            reason: reason("appointment", isToday ? `Coming in today at ${fmt.format(at)}.` : `Coming in tomorrow at ${fmt.format(at)}. Confirm they're still coming.`, at, String(r.id), isToday ? WEIGHT.appointmentToday : WEIGHT.appointmentTomorrow) });
        }
      }
    }),
  ]);

  // Hide what's been marked done, and what's snoozed until later.
  let rows = mergeRows(flat);
  if (rows.length) {
    const keys = rows.flatMap((r) => r.reasons.map((x) => stateKey(r.id, x.reason, x.token)));
    const states = await sql`select key, state, until from todo_state where key = any(${keys})`.catch(() => []);
    const hidden = new Set(states.filter((s) => s.state === "done" || (s.state === "snoozed" && s.until && new Date(s.until).getTime() > now)).map((s) => s.key as string));
    rows = mergeRows(flat.filter((f) => !hidden.has(stateKey(f.id, f.reason.reason, f.reason.token))));
  }
  return { rows, problems };
}

/** Mark items done or snoozed. days = 0 means done for good; otherwise hidden until that many days from today (Dallas time). */
export async function setTodoState(keys: string[], days: number, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const until = days > 0 ? zonedToUtc(addDays(dayKey(Date.now(), tz), days), "07:00", tz) : null;
  dropCached("todos");
  for (const key of keys) {
    await sql`insert into todo_state (key, state, until, by) values (${key}, ${days > 0 ? "snoozed" : "done"}, ${until}, ${by})
      on conflict (key) do update set state = excluded.state, until = excluded.until, by = excluded.by, updated_at = now()`;
  }
}
