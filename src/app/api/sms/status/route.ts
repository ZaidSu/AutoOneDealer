// Twilio reports whether each text was delivered.
import { NextResponse, type NextRequest } from "next/server";
import { updateStatus } from "@/lib/sms";
import { publicUrl, validTwilioSignature } from "@/lib/sms/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  if (!validTwilioSignature(publicUrl(req), params, req.headers.get("x-twilio-signature"))) return new NextResponse("bad signature", { status: 403 });
  await updateStatus(params.MessageSid ?? "", params.MessageStatus ?? "", params.ErrorCode);
  return new NextResponse(null, { status: 204 });
}
