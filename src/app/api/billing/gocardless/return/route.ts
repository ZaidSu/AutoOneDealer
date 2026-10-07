// Where GoCardless sends the owner after connecting the bank. Saves the connection, then starts collecting open bills.
import { NextResponse, type NextRequest } from "next/server";
import { collectOpenBills, setBankMandate } from "@/lib/billing";
import { mandateFromSetup } from "@/lib/billing/gocardless";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const br = req.nextUrl.searchParams.get("br") ?? "";
  try {
    const mandate = br ? await mandateFromSetup(br) : null;
    if (!mandate) return NextResponse.redirect(new URL("/billing?error=bank_setup", req.url), 303);
    await setBankMandate(mandate);
    await collectOpenBills();
    return NextResponse.redirect(new URL("/billing?bank=connected", req.url), 303);
  } catch (error) {
    console.error("[autodash:billing] GoCardless return failed:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/billing?error=bank_setup", req.url), 303);
  }
}
