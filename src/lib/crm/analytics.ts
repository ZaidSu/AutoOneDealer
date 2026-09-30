// Analytics numbers, counted inside the database (a handful of small grouped queries, no matter how many leads).
import { readyDb } from "@/lib/db";

export type AnalyticsData = {
  leadsByDay: Map<string, number>;
  emailsByProvider: Map<string, number>;
  people: { source: string; scope: string | null; state: string | null; hasApp: boolean; financing: string | null; status: string; repId: number | null; n: number }[];
  appointments: { repId: number | null; status: string; n: number }[];
  /** Customers marked purchased in the range (by the day they were marked), by source and salesperson. */
  purchases: { source: string; repId: number | null; n: number }[];
};

export async function analytics(since: Date, timeZone: string): Promise<AnalyticsData | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [days, providers, people, appts, purchases] = await Promise.all([
    sql`select to_char(received_at at time zone ${timeZone}, 'YYYY-MM-DD') as d, count(*)::int as n
        from leads where not ignored and received_at >= ${since} group by 1`,
    sql`select provider, count(*)::int as n from leads where not ignored and received_at >= ${since} group by 1`,
    // People who sent a lead in the range, grouped by everything the charts need.
    sql`select coalesce(c.heard_from, c.first_provider, 'Not known') as source, coalesce(c.state_scope, c.auto_scope) as scope,
          c.state_code as state, (c.last_app_at >= ${since}) as has_app,
          coalesce(c.financing, case when c.app_count > 0 then 'needs_review' end) as financing, c.status, c.rep_id, count(*)::int as n
        from customers c
        where c.key in (select distinct customer_key from leads where not ignored and received_at >= ${since} and customer_key is not null)
        group by 1, 2, 3, 4, 5, 6, 7`,
    sql`select rep_id, status, count(*)::int as n from appointments where starts_at >= ${since} and starts_at <= now() group by 1, 2`,
    sql`select coalesce(heard_from, first_provider, 'Not known') as source, rep_id, count(*)::int as n
        from customers where status = 'purchased' and coalesce(purchased_at, updated_at) >= ${since} group by 1, 2`,
  ]);
  return {
    leadsByDay: new Map(days.map((r) => [r.d as string, r.n as number])),
    emailsByProvider: new Map(providers.map((r) => [(r.provider as string) ?? "Email", r.n as number])),
    people: people.map((r) => ({ source: r.source, scope: r.scope, state: r.state, hasApp: Boolean(r.has_app), financing: r.financing, status: r.status, repId: r.rep_id, n: r.n })),
    appointments: appts.map((r) => ({ repId: r.rep_id, status: r.status, n: r.n })),
    purchases: purchases.map((r) => ({ source: r.source, repId: r.rep_id, n: r.n })),
  };
}
