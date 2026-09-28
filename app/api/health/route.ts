// Public health check. Proves server routes are deployed. Reveals nothing secret.
//   /api/health?check=db   → does the database answer
//   /api/health?check=all  → how long each part of a page load takes (database, Gmail), for troubleshooting
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/auth/config";
import { dbState, lastDbError, readyDb } from "@/lib/db";
import { withGmail } from "@/lib/gmail";
import { getGmailConnection } from "@/lib/gmail/connection";
import { getSyncState } from "@/lib/leads/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const check = req.nextUrl.searchParams.get("check");
  const body: Record<string, unknown> = {
    status: "ok", app: "autodash", configured: isConfigured(), region: process.env.VERCEL_REGION ?? "local", time: new Date().toISOString(),
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
        body[name] = { ms: Date.now() - started, result: await work() };
        (body[name] as { ms: number }).ms = Date.now() - started;
      } catch (error) {
        body[name] = { ms: Date.now() - started, FAILED: error instanceof Error ? error.message.slice(0, 300) : String(error) };
      }
    }
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
