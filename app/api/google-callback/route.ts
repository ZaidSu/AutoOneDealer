// One callback for both Google flows. The encrypted state cookie says which flow started it,
// so Google Cloud only needs the single existing redirect URI.
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { dealershipMailbox, isConfigured, staffRoleFor } from "@/lib/auth/config";
import { exchangeCode, fetchGmailProfile, fetchProfile, revokeToken } from "@/lib/auth/google";
import { saveSharedGmailConnection } from "@/lib/gmail/connection";
import {
  clearCookie,
  readSealed,
  setGmailConnection,
  setStaffSession,
  STAFF_COOKIE,
  STATE_COOKIE,
  validateStaff,
  type OAuthState,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function go(req: NextRequest, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url));
  clearCookie(res, STATE_COOKIE);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) return go(req, "/login?error=config");

  const saved = readSealed<OAuthState>(req.cookies.get(STATE_COOKIE)?.value);
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const denied = req.nextUrl.searchParams.get("error");

  // Without a valid state we don't know which flow this was, so send people to sign-in.
  if (!saved || !state || saved.state !== state || saved.exp < Date.now()) return go(req, "/login?error=expired");
  const flow = saved.flow;
  const fail = (reason: string) => go(req, flow === "gmail" ? `/settings?gmail=${reason}` : `/login?error=${reason}`);

  if (denied) return fail("denied");
  if (!code) return fail("failed");

  try {
    const tokens = await exchangeCode(code);

    if (flow === "signin") {
      const profile = await fetchProfile(tokens.access_token);
      const email = String(profile.email ?? "").toLowerCase();
      if (!email || profile.email_verified !== true) return fail("unverified");
      const role = staffRoleFor(email);
      if (!role) return fail("not_allowed");
      const res = go(req, "/dashboard");
      setStaffSession(res, { email, name: profile.name || email, picture: profile.picture, role });
      return res;
    }

    // Gmail flow: must already be signed in as someone allowed to manage integrations.
    const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
    if (!staff) return go(req, "/login?error=expired");
    if (!can.manageIntegrations(staff.role)) return fail("forbidden");

    const gmail = await fetchGmailProfile(tokens.access_token);
    if (gmail.emailAddress.toLowerCase() !== dealershipMailbox()) {
      if (tokens.refresh_token) await revokeToken(tokens.refresh_token);
      return fail("wrong_account");
    }
    if (!tokens.refresh_token) return fail("no_refresh_token");

    const connection = {
      mailbox: gmail.emailAddress.toLowerCase(),
      refreshToken: tokens.refresh_token,
      connectedBy: staff.email || staff.name,
      connectedAt: Date.now(),
    };
    await saveSharedGmailConnection(connection); // no-op until the database is connected
    const res = go(req, "/settings?gmail=connected");
    setGmailConnection(res, connection);
    return res;
  } catch (error) {
    console.error("Google callback failed:", flow, error instanceof Error ? error.message : "unknown");
    return fail("failed");
  }
}
