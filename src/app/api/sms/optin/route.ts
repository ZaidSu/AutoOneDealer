// The public "Get text updates" sign-up. Saves proof that the person agreed (their number, the exact wording, when, and
// from where). It never sends a text itself, so it can't be used to text strangers.
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/auth/request";
import { logActivity } from "@/lib/crm/queries";
import { readyDb } from "@/lib/db";
import { SMS_CONSENT_TEXT } from "@/lib/legal/config";
import { customerForPhone } from "@/lib/sms";
import { tenDigits, toE164 } from "@/lib/sms/twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return bad("Request blocked.", 403);
  let body: { name?: unknown; phone?: unknown; vehicle?: unknown; agree?: unknown; website?: unknown };
  try { body = await req.json(); } catch { return bad("Something went wrong. Please try again."); }
  if (body.website) return NextResponse.json({ ok: true }); // a hidden field only bots fill in: pretend it worked
  if (body.agree !== true) return bad("Please check the box to agree to receive texts.");
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const vehicle = String(body.vehicle ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const e164 = toE164(String(body.phone ?? ""));
  if (name.length < 2) return bad("Please enter your name.");
  if (!e164) return bad("Please enter a valid 10-digit U.S. mobile number.");

  const sql = await readyDb();
  if (!sql) return bad("We couldn't save that right now. Please call us at the number below.", 503);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null;
  // Slow down repeats: 5 sign-ups an hour from one place, 3 a day for one number.
  const [[byIp], [byPhone]] = await Promise.all([
    sql`select count(*)::int as n from sms_consents where ip = ${ip} and created_at > now() - interval '1 hour'`,
    sql`select count(*)::int as n from sms_consents where phone = ${e164} and created_at > now() - interval '1 day'`,
  ]);
  if (ip && byIp.n >= 5) return bad("Too many sign-ups from this connection. Please try again later.", 429);
  if (byPhone.n >= 3) return NextResponse.json({ ok: true }); // already signed up today; nothing more to do

  await sql`insert into sms_consents (phone, name, vehicle, consent_text, ip, user_agent)
    values (${e164}, ${name}, ${vehicle || null}, ${SMS_CONSENT_TEXT}, ${ip}, ${(req.headers.get("user-agent") ?? "").slice(0, 300)})`;
  try {
    const key = await customerForPhone(e164);
    if (key) {
      const ten = tenDigits(e164);
      await sql`update customers set name = coalesce(nullif(name, ''), ${name}), heard_from = coalesce(heard_from, 'Text sign-up form'), last_seen = now(),
        last_vehicle = coalesce(last_vehicle, ${vehicle || null}), search = ${[name, ten, vehicle].filter(Boolean).join(" ").toLowerCase()}, updated_at = now() where key = ${key}`;
      await logActivity(key, "note", `Signed up for text updates on the website${vehicle ? ` (interested in ${vehicle})` : ""}`, null).catch(() => undefined);
    }
  } catch (error) {
    console.error("[autodash:optin] saved the consent but couldn't add the customer:", error instanceof Error ? error.message : error);
  }
  return NextResponse.json({ ok: true });
}
