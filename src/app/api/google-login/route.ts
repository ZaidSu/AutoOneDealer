// Sign-in. Asks Google for identity only (name + email), never Gmail or Drive access.
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/auth/config";
import { randomToken } from "@/lib/auth/crypto";
import { googleAuthUrl } from "@/lib/auth/google";
import { setOAuthState } from "@/lib/auth/session";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.redirect(new URL("/login?error=config", req.url));
  const state = randomToken();
  const res = NextResponse.redirect(googleAuthUrl(state));
  setOAuthState(res, state);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
