// Public health check. Proves the site is deployed and shows which settings are missing (names only, never values).
import { NextResponse, type NextRequest } from "next/server";
import { missingConfig } from "@/lib/auth/config";
import { dbState, lastDbError } from "@/lib/db";
import { previewMode } from "@/lib/mode";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const body: Record<string, unknown> = {
    status: "ok", app: "marketplace-wholesale", mode: previewMode() ? "preview" : "live", missingSettings: missingConfig(), time: new Date().toISOString(),
  };
  if (req.nextUrl.searchParams.get("check") === "db") {
    body.database = await dbState();
    body.databaseError = lastDbError();
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
