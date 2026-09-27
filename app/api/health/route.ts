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
  if (check === "db" || check === "all") {
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
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
