// Looks back through TODAY's conversations (since midnight, dealership time) and texts the dealership phone about anyone who needed a person (asked for a
// Carfax, was talking numbers, wanted to buy...) before this check existed. Each customer is alerted at most once this way.
import { actOnConversation } from "@/lib/ai/conversation-actions";
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { dayKey, zonedToUtc } from "@/lib/utils/time";

const KEY = "alert_scan_checked";
export type ScanResult = { checked: number; alerted: { name: string; reason: string }[]; remaining: number; stoppedEarly: boolean };

type Line = { at: number; who: "Customer" | "Dealership"; text: string };

export async function scanPastConversations(opts: { maxChecks?: number; maxAlerts?: number; deadline: number }): Promise<ScanResult> {
  const out: ScanResult = { checked: 0, alerted: [], remaining: 0, stoppedEarly: false };
  const sql = await readyDb();
  if (!sql) return out;
  const since = zonedToUtc(dayKey(Date.now(), dealership.timeZone), "00:00", dealership.timeZone) ?? new Date(Date.now() - 12 * 3600_000);
  let done: string[] = [];
  try { const saved = JSON.parse((await getSetting(KEY)) ?? "{}"); if (saved?.since && new Date(saved.since).getTime() > since.getTime() - 3600_000 && Array.isArray(saved.keys)) done = saved.keys; } catch { /* start fresh */ }

  const rows = await sql`select c.key, c.name, c.phone, c.email, c.last_vehicle from customers c
    where c.rep_requested_at is null and c.key in (
      select customer_key from ai_replies where customer_key is not null and coalesce(lead_received_at, created_at) > ${since}
      union select customer_key from customer_replies where customer_key is not null and received_at > ${since}
      union select customer_key from sms_messages where customer_key is not null and direction = 'in' and created_at > ${since})
    order by c.key`;
  const todo = rows.filter((r) => !done.includes(r.key as string));
  const maxChecks = opts.maxChecks ?? 15;
  const maxAlerts = opts.maxAlerts ?? 8;
  let i = 0;
  for (; i < todo.length; i++) {
    if (out.checked >= maxChecks || out.alerted.length >= maxAlerts || Date.now() > opts.deadline - 12_000) { out.stoppedEarly = true; break; }
    const c = todo[i];
    const key = c.key as string;
    const [replies, inbound, texts] = await Promise.all([
      sql`select customer_message, body, status, coalesce(lead_received_at, created_at) as at, created_at from ai_replies where customer_key = ${key} and coalesce(lead_received_at, created_at) > ${since}`,
      sql`select body, received_at from customer_replies where customer_key = ${key} and received_at > ${since}`,
      sql`select direction, body, coalesce(sent_at, created_at) as at from sms_messages where customer_key = ${key} and created_at > ${since} and status not in ('draft', 'discarded', 'failed')`,
    ]);
    const lines: Line[] = [];
    for (const r of replies) {
      if (String(r.customer_message ?? "").trim()) lines.push({ at: new Date(r.at as string).getTime(), who: "Customer", text: String(r.customer_message) });
      if (["sent", "draft"].includes(String(r.status)) && String(r.body ?? "").trim()) lines.push({ at: new Date(r.created_at as string).getTime(), who: "Dealership", text: String(r.body) });
    }
    for (const r of inbound) lines.push({ at: new Date(r.received_at as string).getTime(), who: "Customer", text: String(r.body ?? "") });
    for (const r of texts) lines.push({ at: new Date(r.at as string).getTime(), who: r.direction === "in" ? "Customer" : "Dealership", text: String(r.body ?? "") });
    lines.sort((a, b) => a.at - b.at);
    done.push(key);
    out.checked++;
    if (!lines.some((l) => l.who === "Customer")) continue;
    const result = await actOnConversation({
      customerKey: key, name: (c.name as string) ?? null, phone: (c.phone as string) ?? null, email: (c.email as string) ?? null, vehicle: (c.last_vehicle as string) ?? null, channel: "email",
      conversation: lines.map((l) => `${l.who}: ${l.text.replace(/\s+/g, " ").slice(0, 700)}`).join("\n"),
    }, { backfill: true });
    if (result.repAlerted) out.alerted.push({ name: (c.name as string) || (c.phone as string) || key, reason: result.reason ?? "needs a person" });
  }
  out.remaining = Math.max(0, todo.length - i);
  // When everyone has been looked at, the next scan starts over (people already alerted are still skipped).
  await setSetting(KEY, JSON.stringify({ since: since.toISOString(), keys: out.remaining === 0 ? [] : done })).catch(() => undefined);
  return out;
}
