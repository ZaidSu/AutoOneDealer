// Creates the database tables (Developer page button). Always answers with JSON, never a crash.
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { isSameOrigin } from "@/lib/auth/request";
import { GMAIL_COOKIE, readSealed, STAFF_COOKIE, validateStaff, type GmailConnection } from "@/lib/auth/session";
import { dbState } from "@/lib/db";
import { setupDatabase } from "@/lib/db/schema";
import { saveSharedGmailConnection } from "@/lib/gmail/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const reply = (ok: boolean, message: string, status = ok ? 200 : 400) => NextResponse.json({ ok, message }, { status });
  try {
    if (!isSameOrigin(req)) return reply(false, "Request blocked.", 403);
    const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
    if (!staff || !can.useDeveloperTools(staff.role)) return reply(false, "Only owners and developers can do this.", 403);
    if ((await dbState()) === "not_configured") return reply(false, "Add DATABASE_URL in Vercel first, then redeploy.");

    await setupDatabase();
    const local = readSealed<GmailConnection>(req.cookies.get(GMAIL_COOKIE)?.value);
    if (local) await saveSharedGmailConnection(local);
    return reply(true, local ? "Database is ready, and the Gmail connection is now shared." : "Database is ready.");
  } catch (error) {
    const e = error as { code?: string; message?: string };
    const detail = `${e?.code ? `${e.code}: ` : ""}${e?.message ?? String(error)}`.replace(/postgres(ql)?:\/\/\S+/gi, "[address hidden]").slice(0, 240);
    console.error("Database setup failed:", detail);
    return reply(false, `Setup failed: ${detail}`, 500);
  }
}
