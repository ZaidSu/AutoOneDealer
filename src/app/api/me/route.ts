// Who is signed in, for the page frame (name, role, greeting). The frame itself is static and loads instantly.
import { NextResponse, type NextRequest } from "next/server";
import { roleLabel } from "@/lib/auth/access";
import { STAFF_COOKIE, VIEW_COOKIE, validateStaff } from "@/lib/auth/session";
import { dealership, greeting } from "@/lib/dealership";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value, req.cookies.get(VIEW_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "signed out" }, { status: 401 });
  return NextResponse.json({
    name: staff.name, firstName: staff.name.split(" ")[0], role: staff.role, roleLabel: roleLabel[staff.role],
    viewAs: staff.viewAs ?? null, canPreview: staff.role === "developer" || Boolean(staff.viewAs),
    dealershipName: dealership.name, greeting: greeting(),
  });
}
