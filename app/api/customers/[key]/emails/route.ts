// Emails to and from one customer (their email addresses from saved leads), newest first.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { getCustomer } from "@/lib/crm/queries";
import { mapLimit, withGmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ messages: null }, { status: 401 });
  const customer = await getCustomer((await params).key).catch(() => null);
  if (!customer?.email) return NextResponse.json({ messages: [] });
  const email = customer.email.replace(/["\\]/g, "");
  const result = await withGmail(async (g) => {
    const ids = await g.listIds(`from:${email} OR to:${email}`, 15);
    return mapLimit(ids, 5, (id) => g.summary(id));
  });
  if (result.status !== "ok") return NextResponse.json({ messages: null });
  return NextResponse.json({ messages: result.data.sort((a, b) => b.receivedAt - a.receivedAt) });
}
