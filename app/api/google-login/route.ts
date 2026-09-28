// Staff sign-in. Asks Google for identity only (name + email), never Gmail access.
// Path kept as /api/google-login for compatibility with the existing Google Cloud setup.
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/auth/config";
import { randomToken } from "@/lib/auth/crypto";
import { googleAuthUrl, SIGNIN_SCOPES } from "@/lib/auth/google";
import { setOAuthState } from "@/lib/auth/session";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.redirect(new URL("/login?error=config", req.url));
  const state = randomToken();
  const res = NextResponse.redirect(googleAuthUrl({ state, scopes: SIGNIN_SCOPES }));
  setOAuthState(res, state, "signin");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
