// Stripe tells AutoDash a payment went through, even if the person closed the tab before coming back.
import { NextResponse, type NextRequest } from "next/server";
import { completeCardCheckout } from "@/lib/billing";
import { verifyWebhook } from "@/lib/billing/stripe";
import { refreshStripeBilling } from "@/lib/billing/stripe-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"))) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const event = JSON.parse(raw);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data?.object ?? {};
    // Looks the session up again (with the card details), marks the bill paid and saves the card for autopay.
    if (session.payment_status === "paid" && session.id) await completeCardCheckout(session.id);
  }
  // Billing managed in Stripe: any change to an invoice, payment or subscription makes the Billing page read fresh from Stripe.
  if (/^(invoice|customer\.subscription|customer|payment_method|invoiceitem)\./.test(String(event.type))) refreshStripeBilling();
  return NextResponse.json({ received: true });
}
