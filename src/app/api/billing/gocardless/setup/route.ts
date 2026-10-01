// "Connect bank account": opens GoCardless's secure page where the owner authorizes bank payments (ACH).
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { isSameOrigin } from "@/lib/auth/request";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { startBankSetup } from "@/lib/billing/gocardless";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/billing?${q}`, req.url), 303);
  if (!isSameOrigin(req)) return back("error=blocked");
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.redirect(new URL("/login?error=expired", req.url), 303);
  if (!can.viewBilling(staff.role)) return back("error=forbidden");
  try {
    const { url } = await startBankSetup(req.nextUrl.origin, staff.email || undefined);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error("[autodash:billing] GoCardless setup failed:", error instanceof Error ? error.message : error);
    return back("error=bank");
  }
}
