// Sending texts through Twilio's API, and checking that incoming webhooks really come from Twilio.
// Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER (optional: TWILIO_MESSAGING_SERVICE_SID).
import { createHmac, timingSafeEqual } from "node:crypto";

export const twilioConfigured = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID));

/** "(469) 555-0111", "469-555-0111", "+14695550111" -> "+14695550111". US numbers only; null if it isn't one. */
export function toE164(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
/** The 10-digit form AutoDash uses for customer keys ("p-4695550111"). */
export const tenDigits = (e164: string) => e164.replace(/\D/g, "").slice(-10);

export async function sendSms(to: string, body: string, statusCallback?: string): Promise<{ sid: string; status: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form: Record<string, string> = { To: to, Body: body };
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.MessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  else form.From = toE164(process.env.TWILIO_PHONE_NUMBER) ?? String(process.env.TWILIO_PHONE_NUMBER);
  if (statusCallback) form.StatusCallback = statusCallback;
  const response = await fetch(`${process.env.TWILIO_BASE_URL || "https://api.twilio.com"}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(explainTwilioError(data?.code, data?.message ?? `Twilio error ${response.status}`));
  return { sid: data.sid, status: data.status };
}

/** Plain-English versions of the Twilio errors people actually hit. */
export function explainTwilioError(code: number | string | undefined, fallback: string): string {
  switch (Number(code)) {
    case 21610: return "This customer replied STOP, so they can't be texted until they reply START.";
    case 21211: case 21614: return "That phone number can't receive texts.";
    case 30034: case 30007: return "Carriers blocked the text. Usually this means the A2P 10DLC registration isn't approved yet.";
    case 20003: return "Twilio rejected the login. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel.";
    case 21606: case 21659: return "The 'from' number isn't a Twilio texting number on this account. Check TWILIO_PHONE_NUMBER.";
    default: return fallback;
  }
}

/** Twilio signs each webhook: HMAC-SHA1 of the full URL plus every form field (sorted), with the auth token. */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null, token = process.env.TWILIO_AUTH_TOKEN ?? ""): boolean {
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The exact address Twilio called, which its signature is based on. */
export function publicUrl(req: { nextUrl: URL; headers: Headers }): string {
  if (process.env.APP_URL) return `${process.env.APP_URL.replace(/\/$/, "")}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
}

