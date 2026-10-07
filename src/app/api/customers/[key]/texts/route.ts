// One customer's text conversation, for the live view on their page.
import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured } from "@/lib/ai/claude";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { getCustomer } from "@/lib/crm/queries";
import { fresh } from "@/lib/db";
import { isOptedOut, threadFor } from "@/lib/sms";
import { toE164, twilioConfigured } from "@/lib/sms/twilio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const key = (await params).key;
  try {
    const customer = await fresh("Texts", () => getCustomer(key));
    if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });
    const phone = toE164(customer.phone);
    const [messages, optedOut] = await fresh("Texts", () => Promise.all([threadFor(key, customer.phone), phone ? isOptedOut(phone) : Promise.resolve(false)]));
    return NextResponse.json({ configured: twilioConfigured(), ai: aiConfigured(), phone, optedOut, messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't load texts" }, { status: 500 });
  }
}
