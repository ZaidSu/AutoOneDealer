// Where Stripe sends people after paying. Confirms with Stripe directly (never trusts the address alone).
import { NextResponse, type NextRequest } from "next/server";
import { markPaid } from "@/lib/billing";
import { getCheckout } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("session_id") ?? "";
  try {
    const session = await getCheckout(id);
    const invoiceId = Number(session.metadata?.invoice_id);
    if (session.payment_status === "paid" && invoiceId) {
      await markPaid(invoiceId, session.id);
      return NextResponse.redirect(new URL("/billing?paid=1", req.url), 303);
    }
  } catch (error) {
    console.error("[autodash:billing] return check failed:", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(new URL("/billing?pending=1", req.url), 303);
}
