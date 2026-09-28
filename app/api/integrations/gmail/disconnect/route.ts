// Removes AutoDash's access to the dealership inbox. Does not sign the staff member out.
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { revokeToken } from "@/lib/auth/google";
import { isSameOrigin } from "@/lib/auth/request";
import { clearSharedGmailConnection, loadGmailConnection } from "@/lib/gmail/connection";
import {clearCookie, GMAIL_COOKIE, STAFF_COOKIE, validateStaff } from "@/lib/auth/session";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, message: "Request blocked." }, { status: 403 });
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ ok: false, message: "Your session ended. Sign in again." }, { status: 401 });
  if (!can.manageIntegrations(staff.role)) {
    return NextResponse.json({ ok: false, message: "Only owners and managers can disconnect the inbox." }, { status: 403 });
  }

  const connection = await loadGmailConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (connection) await revokeToken(connection.refreshToken);
  const res = NextResponse.json({ ok: true, message: "Gmail disconnected." });
  await clearSharedGmailConnection();
  clearCookie(res, GMAIL_COOKIE);
  return res;
}
