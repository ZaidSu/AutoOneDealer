// The Contacts page: one row per person, newest first, with the ones waiting on a sales rep on top.
import { readyDb } from "@/lib/db";

export type Contact = { key: string; name: string | null; phone: string | null; car: string | null; reachedAt: number | null; lastAt: number | null; status: string; waitingOnRep: boolean; purchased: boolean };
export type ContactFilter = "all" | "waiting" | "purchased" | "active";

export async function listContacts(opts: { q?: string; filter?: ContactFilter }): Promise<{ rows: Contact[]; counts: { all: number; waiting: number; purchased: number } }> {
  const sql = await readyDb();
  const empty = { rows: [], counts: { all: 0, waiting: 0, purchased: 0 } };
  if (!sql) return empty;
  const needle = (opts.q ?? "").trim().toLowerCase().slice(0, 60);
  const digits = needle.replace(/\D/g, "");
  const like = `%${needle.replace(/[%_\\]/g, "")}%`;
  // "Waiting on a sales rep": the AI told the dealership they want one, and nobody on the team has called, texted, emailed or marked them contacted since.
  const all = await sql`
    select * from (
      select c.key, c.name, c.phone, c.status, coalesce(c.purchased_vehicle, c.last_vehicle, c.vehicles[1]) as car, c.first_seen, c.last_seen, c.search,
        (c.rep_requested_at is not null and c.status not in ('purchased', 'lost') and c.rep_requested_at > now() - interval '21 days'
          and (c.contacted_at is null or c.contacted_at < c.rep_requested_at)
          and not exists (select 1 from activities a where a.customer_key = c.key and a.created_at > c.rep_requested_at
            and coalesce(a.staff, '') not ilike 'AI%' and a.kind in ('call', 'text', 'email', 'visit', 'voicemail', 'appointment'))) as waiting
      from customers c
    ) t
    where ${needle ? sql`(lower(coalesce(name, '')) like ${like} or lower(coalesce(car, '')) like ${like} or ${digits.length >= 3 ? sql`coalesce(phone, '') like ${`%${digits}%`}` : sql`false`})` : sql`true`}
    order by waiting desc, coalesce(last_seen, first_seen) desc nulls last limit 600`;
  const toContact = (r: Record<string, unknown>): Contact => ({
    key: r.key as string, name: (r.name as string) ?? null, phone: (r.phone as string) ?? null, car: (r.car as string) ?? null,
    reachedAt: r.first_seen ? new Date(r.first_seen as string).getTime() : null, lastAt: r.last_seen ? new Date(r.last_seen as string).getTime() : null,
    status: String(r.status), waitingOnRep: Boolean(r.waiting), purchased: r.status === "purchased",
  });
  const rows = all.map(toContact);
  const counts = { all: rows.length, waiting: rows.filter((r) => r.waitingOnRep).length, purchased: rows.filter((r) => r.purchased).length };
  const f = opts.filter ?? "all";
  return { rows: f === "waiting" ? rows.filter((r) => r.waitingOnRep) : f === "purchased" ? rows.filter((r) => r.purchased) : f === "active" ? rows.filter((r) => !r.purchased && r.status !== "lost") : rows, counts };
}
