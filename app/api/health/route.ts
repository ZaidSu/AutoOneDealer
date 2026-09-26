// Public liveness check. Proves server routes are deployed. Reveals nothing about secrets.
import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", app: "autodash", configured: isConfigured(), time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
