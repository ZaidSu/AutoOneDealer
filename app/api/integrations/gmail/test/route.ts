// Proves the saved Gmail connection still works by reading the mailbox profile (no message content).
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { explainGoogleError, fetchGmailProfile, refreshAccessToken } from "@/lib/auth/google";
import { isSameOrigin } from "@/lib/auth/request";
import { loadGmailConnection } from "@/lib/gmail/connection";
import {GMAIL_COOKIE, STAFF_COOKIE, validateStaff } from "@/lib/auth/session";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, message: "Request blocked." }, { status: 403 });
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ ok: false, message: "Your session ended. Sign in again." }, { status: 401 });
  if (!can.manageIntegrations(staff.role)) {
    return NextResponse.json({ ok: false, message: "Only owners and managers can test the inbox connection." }, { status: 403 });
  }

  const connection = await loadGmailConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (!connection) return NextResponse.json({ ok: false, message: "Gmail isn't connected yet." }, { status: 404 });

  try {
    const { access_token } = await refreshAccessToken(connection.refreshToken);
    const profile = await fetchGmailProfile(access_token);
    return NextResponse.json({ ok: true, mailbox: profile.emailAddress, message: `Connected to ${profile.emailAddress}.` });
  } catch (error) {
    const { message, code } = explainGoogleError(error);
    console.error("Gmail test failed:", code);
    return NextResponse.json({ ok: false, message, code }, { status: 502 });
  }
}
