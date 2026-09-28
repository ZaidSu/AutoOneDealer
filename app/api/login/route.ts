// Open login: signs anyone in, with or without a username. See openLoginEnabled() in lib/auth/config.ts.
// The password field is ignored and never stored or logged.
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, openLoginEnabled } from "@/lib/auth/config";
import { isSameOrigin } from "@/lib/auth/request";
import { setStaffSession } from "@/lib/auth/session";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.redirect(new URL("/login?error=failed", req.url), 303);
  if (!isConfigured()) return NextResponse.redirect(new URL("/login?error=config", req.url), 303);
  if (!openLoginEnabled()) return NextResponse.redirect(new URL("/login", req.url), 303);

  const form = await req.formData().catch(() => null);
  const username = String(form?.get("username") ?? "").trim().replace(/[^\p{L}\p{N} .@'_-]/gu, "").slice(0, 60);
  const name = username.includes("@") ? username.split("@")[0] : username;

  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  setStaffSession(res, { email: username.includes("@") ? username.toLowerCase() : "", name: name || "Team", role: "owner", open: true });
  return res;
}
