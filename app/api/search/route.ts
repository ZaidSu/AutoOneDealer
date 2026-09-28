// The search box on every page: customers by name, phone, email, car or source.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { searchCustomers } from "@/lib/crm/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ hits: [] }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  try {
    return NextResponse.json({ hits: await searchCustomers(q) });
  } catch {
    return NextResponse.json({ hits: [] });
  }
}
