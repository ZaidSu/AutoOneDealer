// Unread inbox count for the Dashboard and the sidebar. Remembered for a minute so tabs don't each ask Gmail.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { withGmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 10;
let cached: { unread: number; at: number } | null = null;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ unread: null }, { status: 401 });
  if (cached && Date.now() - cached.at < 60_000) return NextResponse.json({ unread: cached.unread });
  const result = await Promise.race([
    withGmail((g) => g.inboxUnread()),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
  if (result?.status === "ok") cached = { unread: result.data, at: Date.now() };
  return NextResponse.json({ unread: result?.status === "ok" ? result.data : null });
}
