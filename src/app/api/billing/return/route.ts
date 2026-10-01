// Where Stripe sends people after paying. Confirms with Stripe directly (never trusts the address alone), marks the
// bill paid, and saves the card for autopay if they chose it.
import { NextResponse, type NextRequest } from "next/server";
import { completeCardCheckout } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if ((await completeCardCheckout(req.nextUrl.searchParams.get("session_id") ?? "")) === "paid") {
      return NextResponse.redirect(new URL("/billing?paid=1", req.url), 303);
    }
  } catch (error) {
    console.error("[autodash:billing] return check failed:", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(new URL("/billing?pending=1", req.url), 303);
}
