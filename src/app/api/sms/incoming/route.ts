// Twilio calls this when a customer texts the dealership number. Saves the text, then (after answering Twilio)
// has the AI write a reply and refreshes the customer's summary.
import { after, NextResponse, type NextRequest } from "next/server";
import { refreshSummarySoon } from "@/lib/ai/summary";
import { aiHoursOpen } from "@/lib/ai/schedule";
import { aiReplyToText, receiveText } from "@/lib/sms";
import { publicUrl, validTwilioSignature } from "@/lib/sms/twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const twiml = () => new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "Content-Type": "text/xml" } });

export async function POST(req: NextRequest) {
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  if (!validTwilioSignature(publicUrl(req), params, req.headers.get("x-twilio-signature"))) {
    console.error("[autodash:sms] rejected a webhook with a bad signature");
    return new NextResponse("bad signature", { status: 403 });
  }
  const result = await receiveText(params.From ?? "", params.Body ?? "", params.MessageSid ?? "");
  if (result && !result.keyword) {
    after(async () => {
      // During AI hours the AI answers right away; outside them, staff see the text and can ask the AI for a draft.
      if (await aiHoursOpen()) await aiReplyToText(result.customerKey, result.phone).catch((e) => console.error("[autodash:sms] AI reply failed:", e instanceof Error ? e.message : e));
      await refreshSummarySoon(result.customerKey);
    });
  }
  return twiml();
}
