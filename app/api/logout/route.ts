import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/auth/request";
import { clearCookie, STAFF_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const res = NextResponse.redirect(new URL("/login?signed_out=1", req.url), 303);
  clearCookie(res, STAFF_COOKIE);
  return res;
}
