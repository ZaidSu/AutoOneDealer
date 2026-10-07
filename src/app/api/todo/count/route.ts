// How many things are on the To do list, for the number next to "To do" in the sidebar.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { getTodos } from "@/lib/crm/todos";
import { dbState } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  if ((await dbState()) !== "ready") return NextResponse.json({ count: 0 });
  try {
    const { rows } = await getTodos();
    return NextResponse.json({ count: rows.length, urgent: rows.filter((r) => r.weight <= 1).length });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
