// "Update now": pulls new lead emails from Gmail into the database right away.
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/auth/request";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { withGmail } from "@/lib/gmail";
import { syncLeads } from "@/lib/leads/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, message: "Request blocked." }, { status: 403 });
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ ok: false, message: "Your session ended. Sign in again." }, { status: 401 });
  try {
    const result = await withGmail((gmail) => syncLeads(gmail, { budget: 400 }));
    if (result.status === "not_connected") return NextResponse.json({ ok: false, message: "Connect Gmail in Settings first." });
    if (result.status === "error") return NextResponse.json({ ok: false, message: result.message });
    if ("busy" in result.data) return NextResponse.json({ ok: true, message: "Already updating. Give it a few seconds." });
    const { saved, remaining } = result.data;
    return NextResponse.json({
      ok: true,
      message: remaining > 0 ? `${saved.toLocaleString()} leads saved. Still importing ${remaining.toLocaleString()} older emails.` : `Up to date. ${saved.toLocaleString()} leads saved.`,
      remaining,
    });
  } catch (error) {
    console.error("Lead sync failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Couldn't update right now. Try again in a minute." }, { status: 500 });
  }
}
