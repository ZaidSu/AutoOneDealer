// Where Google sends people back after they pick an account. Only emails on the allowlist get in.
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, staffRoleFor } from "@/lib/auth/config";
import { exchangeCode, fetchProfile } from "@/lib/auth/google";
import { clearCookie, readSealed, setStaffSession, STATE_COOKIE, type OAuthState } from "@/lib/auth/session";

export const maxDuration = 45;
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
  if (!saved || !state || saved.state !== state || saved.exp < Date.now()) return go(req, "/login?error=expired");
  if (req.nextUrl.searchParams.get("error")) return go(req, "/login?error=denied");
  if (!code) return go(req, "/login?error=failed");

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetchProfile(tokens.access_token);
    const email = String(profile.email ?? "").toLowerCase();
    if (!email || profile.email_verified !== true) return go(req, "/login?error=unverified");
    const role = staffRoleFor(email);
    if (!role) return go(req, "/login?error=not_allowed");
    const res = go(req, "/invoices");
    setStaffSession(res, { email, name: profile.name || email, picture: profile.picture, role });
    return res;
  } catch (error) {
    console.error("Google callback failed:", error instanceof Error ? error.message : "unknown");
    return go(req, "/login?error=failed");
  }
}
