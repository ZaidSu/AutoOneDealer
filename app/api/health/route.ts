// Public health check. Proves server routes are deployed. Reveals nothing secret.
// /api/health?check=db also reports whether the database answers (errors have addresses removed).
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/auth/config";
import { dbState, lastDbError } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const body: Record<string, unknown> = { status: "ok", app: "autodash", configured: isConfigured(), time: new Date().toISOString() };
  if (req.nextUrl.searchParams.get("check") === "db") {
    const started = Date.now();
    try {
      body.database = await dbState();
      body.databaseError = lastDbError();
    } catch (error) {
      body.database = "crashed";
      body.databaseError = error instanceof Error ? error.message.slice(0, 200) : String(error);
    }
    body.databaseMs = Date.now() - started;
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
