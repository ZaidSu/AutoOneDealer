// Starts the separate Gmail connection. Only owners and managers may connect the dealership inbox.
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { dealershipMailbox, isConfigured } from "@/lib/auth/config";
import { randomToken } from "@/lib/auth/crypto";
import { GMAIL_SCOPES, googleAuthUrl } from "@/lib/auth/google";
import { setOAuthState, STAFF_COOKIE, validateStaff } from "@/lib/auth/session";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!isConfigured()) return NextResponse.redirect(new URL("/settings?gmail=config", req.url));
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.redirect(new URL("/login?error=expired", req.url));
  if (!can.manageIntegrations(staff.role)) return NextResponse.redirect(new URL("/settings?gmail=forbidden", req.url));

  const state = randomToken();
  const res = NextResponse.redirect(
    googleAuthUrl({ state, scopes: GMAIL_SCOPES, offline: true, loginHint: dealershipMailbox() }),
  );
  setOAuthState(res, state, "gmail");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
