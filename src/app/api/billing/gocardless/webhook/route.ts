// GoCardless reports when a bank payment is confirmed or fails, and when a bank connection is canceled.
import { NextResponse, type NextRequest } from "next/server";
import { handleBankEvent } from "@/lib/billing";
import { validGoCardlessSignature } from "@/lib/billing/gocardless";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // GoCardless expects 498 when the signature is wrong.
  if (!validGoCardlessSignature(raw, req.headers.get("webhook-signature"))) return NextResponse.json({ error: "invalid signature" }, { status: 498 });
  const events = (JSON.parse(raw).events ?? []) as Parameters<typeof handleBankEvent>[0][];
  for (const event of events) await handleBankEvent(event);
  return new NextResponse(null, { status: 204 });
}
