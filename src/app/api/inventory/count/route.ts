// How many cars are for sale right now, for the number next to "Inventory" in the sidebar.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { dbState, readyDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  if ((await dbState()) !== "ready") return NextResponse.json({ count: 0 });
  try {
    const sql = await readyDb();
    const [row] = sql ? await sql`select count(*)::int as n from inventory where status = 'available'` : [{ n: 0 }];
    return NextResponse.json({ count: row?.n ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
