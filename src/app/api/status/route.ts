// Problems every page should show a bar for (right now: the dealership Gmail stopped working), for the people who can fix it.
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { getGmailHealth } from "@/lib/gmail/health";
import { bannerText } from "@/lib/gmail/health-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ gmail: null }, { status: 401 });
  // Only the people who can reconnect Gmail (owner, manager, developer) see the bar.
  if (!can.manageIntegrations(staff.role)) return NextResponse.json({ gmail: null });
  try {
    const health = await Promise.race([getGmailHealth(), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
    return NextResponse.json({ gmail: bannerText(health), since: health && !health.ok ? health.since : null });
  } catch {
    return NextResponse.json({ gmail: null });
  }
}
