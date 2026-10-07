// "Update now": pulls new lead emails from Gmail into the database right away.
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/auth/request";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { withGmail } from "@/lib/gmail";
import { getSyncState, syncLeads } from "@/lib/leads/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, message: "Request blocked." }, { status: 403 });
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ ok: false, message: "Your session ended. Sign in again." }, { status: 401 });
  try {
    // Skip Gmail entirely if a check just ran; every open AutoDash tab calls this about once a minute.
    const last = await getSyncState();
    if (last && last.remaining === 0 && Date.now() - last.lastRun < 45_000 && req.nextUrl.searchParams.get("force") !== "1") {
      return NextResponse.json({ ok: true, saved: 0, remaining: 0, total: last.saved, message: `Up to date. ${last.saved.toLocaleString()} leads saved.` });
    }
    const result = await withGmail((gmail) => syncLeads(gmail, { timeLimitMs: 20_000 }), undefined, "background");
    if (result.status === "not_connected") return NextResponse.json({ ok: false, message: "Connect Gmail in Settings first." });
    if (result.status === "error") return NextResponse.json({ ok: false, message: result.message });
    if ("busy" in result.data) return NextResponse.json({ ok: true, saved: 0, remaining: 0, message: "Already updating. Give it a few seconds." });
    const { saved, remaining, added = 0 } = result.data;
    return NextResponse.json({
      ok: true,
      saved: added,
      total: saved,
      message: remaining > 0 ? `${saved.toLocaleString()} leads saved. Still importing ${remaining.toLocaleString()} older emails.` : `Up to date. ${saved.toLocaleString()} leads saved.`,
      remaining,
    });
  } catch (error) {
    console.error("Lead sync failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Couldn't update right now. Try again in a minute." }, { status: 500 });
  }
}
