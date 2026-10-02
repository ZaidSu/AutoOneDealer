// How many cars are for sale right now, for the number next to "Inventory" in the sidebar.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { dbState } from "@/lib/db";
import { inventoryCounts } from "@/lib/inventory/store";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  if ((await dbState()) !== "ready") return NextResponse.json({ count: 0 });
  try {
    return NextResponse.json({ count: (await inventoryCounts()).available });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
