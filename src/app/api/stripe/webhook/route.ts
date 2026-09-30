// Stripe tells AutoDash a payment went through, even if the person closed the tab before coming back.
import { NextResponse, type NextRequest } from "next/server";
import { markPaid } from "@/lib/billing";
import { verifyWebhook } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"))) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const event = JSON.parse(raw);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data?.object ?? {};
    const invoiceId = Number(session.metadata?.invoice_id);
    if (session.payment_status === "paid" && invoiceId) await markPaid(invoiceId, session.id);
  }
  return NextResponse.json({ received: true });
}
