// Public health check. Proves server routes are deployed. Reveals nothing secret.
//   /api/health?check=db   → does the database answer
//   /api/health?check=all  → how long each part of a page load takes (database, Gmail), for troubleshooting
import { aiConfigured } from "@/lib/ai/claude";
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/auth/config";
import { dbState, lastDbError, readyDb } from "@/lib/db";
import { withGmail } from "@/lib/gmail";
import { getGmailConnection } from "@/lib/gmail/connection";
import { getSyncState } from "@/lib/leads/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const check = req.nextUrl.searchParams.get("check");
  const body: Record<string, unknown> = {
    status: "ok", app: "autodash", configured: isConfigured(), ai: aiConfigured(), timer: Boolean(process.env.CRON_SECRET), region: process.env.VERCEL_REGION ?? "local", time: new Date().toISOString(),
  };
  if (check === "db" || check === "all" || check === "pages") {
    const started = Date.now();
    body.database = await dbState();
    body.databaseError = lastDbError();
    body.databaseMs = Date.now() - started;
  }
  if (check === "all") {
    const step = async (name: string, work: () => Promise<unknown>) => {
      const started = Date.now();
      try {
        const result = await work();
        body[name] = { ms: Date.now() - started, result };
      } catch (error) {
        body[name] = { ms: Date.now() - started, result: `failed: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}` };
      }
    };
    await step("simpleQuery", async () => { const sql = await readyDb(); if (!sql) return "no database"; await sql`select 1`; return "ok"; });
    await step("savedLeads", async () => { const sql = await readyDb(); if (!sql) return 0; const [r] = await sql`select count(*)::int as n from leads where not ignored`; return r.n; });
    await step("gmailConnection", async () => ((await getGmailConnection()) ? "connected" : "not connected"));
    await step("gmailUnread", async () => {
      const r = await withGmail((g) => g.inboxUnread());
      return r.status === "ok" ? r.data : r.status === "error" ? `error ${r.code}` : r.status;
    });
    await step("importStatus", async () => {
      const s = await getSyncState();
      return s ? { saved: s.saved, stillToImport: s.remaining, lastRunSecondsAgo: Math.round((Date.now() - s.lastRun) / 1000) } : "never ran";
    });
  }
  if (check === "pages" || check === "all") {
    const { db } = await import("@/lib/db");
    const sql = db(); // works even when setup failed, so the cause can be seen
    if (sql) {
      const rows = await sql`select key, value from app_settings where key in ('customers_built', 'customers_build_error', 'schema_version')`.catch(() => []);
      const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
      body.schemaVersion = get("schema_version");
      body.customersBuilt = get("customers_built") === "1";
      body.customersBuildError = get("customers_build_error");
      // Sessions that are busy or stuck mid-transaction (a stuck one blocks the upgrade and page loads).
      body.busySessions = await sql`
        select state, extract(epoch from now() - coalesce(xact_start, state_change))::int as seconds, left(query, 60) as query
        from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
        order by seconds desc limit 5`.catch((e) => `unavailable: ${e instanceof Error ? e.message.slice(0, 80) : ""}`);
    }
  }
  if (check === "perf") {
    // Stopwatch results from real page loads: medians and slowest, per page, split by browser/network phase.
    // `stream_ms` is responseStart -> responseEnd; with Next streaming it can include server/database work.
    const { db } = await import("@/lib/db");
    const sql = db();
    if (sql) {
      const summary = await sql`
        select route, kind, count(*)::int as loads,
          percentile_disc(0.5) within group (order by total) as median_ms,
          max(total) as slowest_ms,
          percentile_disc(0.5) within group (order by connect) as connect_ms,
          percentile_disc(0.5) within group (order by server) as ttfb_ms,
          percentile_disc(0.5) within group (order by data) as stream_ms,
          percentile_disc(0.5) within group (order by browser) as browser_ms,
          count(*) filter (where cold)::int as cold_starts,
          percentile_disc(0.5) within group (order by total) filter (where cold) as cold_median_ms
        from perf_log where at > now() - interval '2 days'
        group by route, kind order by kind, median_ms desc`.catch(() => "no stopwatch data yet");
      body.perf = summary;
      // The last few newly started servers: where their start-up time went.
      body.coldStarts = await sql`select to_char(at, 'HH24:MI') as at, route, total, detail from perf_log
        where detail is not null order by id desc limit 8`.catch(() => []);
    }
  }
  if (check === "pages") {
    // Runs what each page loads and reports what fails, with the real reason (page errors are hidden in production).
    const { followUps, leadCounts, listReps, appointmentsBetween } = await import("@/lib/db/data");
    const { queryLeads } = await import("@/lib/leads/store");
    const { listCustomers, pipeline, searchCustomers } = await import("@/lib/crm/queries");
    const { analytics } = await import("@/lib/crm/analytics");
    const today = new Date().toISOString().slice(0, 10);
    const parts: Record<string, () => Promise<unknown>> = {
      followUps: async () => (await followUps(today, null)).length,
      counts: () => leadCounts(new Date(Date.now() - 86400000), new Date(Date.now() - 7 * 86400000)),
      reps: async () => (await listReps()).length,
      appointmentsToday: async () => (await appointmentsBetween(new Date(Date.now() - 86400000), new Date(), null)).length,
      newestLeads: async () => (await queryLeads({ limit: 6 })).leads.length,
      customers: async () => (await listCustomers({}, 0, 50)).total,
      pipeline: async () => (await pipeline({ days: 60 })).map((c) => `${c.status} ${c.count}`).join(", "),
      search: async () => (await searchCustomers("a")).length,
      analytics: async () => ((await analytics(new Date(Date.now() - 30 * 86400000), "America/Chicago"))?.people.length ?? "no db"),
    };
    for (const [name, work] of Object.entries(parts)) {
      const started = Date.now();
      try {
        const result = await Promise.race([work(), new Promise((_, reject) => setTimeout(() => reject(new Error("took longer than 8 seconds")), 8000))]);
        body[name] = { ms: Date.now() - started, result };
      } catch (error) {
        body[name] = { ms: Date.now() - started, FAILED: error instanceof Error ? error.message.slice(0, 300) : String(error) };
      }
    }
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
