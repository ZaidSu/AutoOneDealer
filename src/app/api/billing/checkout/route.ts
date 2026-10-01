// "Pay now": opens Stripe's secure payment page for one bill.
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/access";
import { isSameOrigin } from "@/lib/auth/request";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { getInvoice, setCheckoutSession } from "@/lib/billing";
import { createCheckout } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/billing?${q}`, req.url), 303);
  if (!isSameOrigin(req)) return back("error=blocked");
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.redirect(new URL("/login?error=expired", req.url), 303);
  if (!can.viewBilling(staff.role)) return back("error=forbidden");
  const form = await req.formData().catch(() => null);
  const invoice = await getInvoice(Number(form?.get("invoiceId")));
  if (!invoice || invoice.status !== "open") return back("error=not_open");
  try {
    const session = await createCheckout(invoice, req.nextUrl.origin, staff.email || undefined, form?.get("autopay") === "on");
    await setCheckoutSession(invoice.id, session.id);
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("[autodash:billing] checkout failed:", error instanceof Error ? error.message : error);
    return back("error=stripe");
  }
}
