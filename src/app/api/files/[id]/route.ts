// Serves an uploaded invoice, receipt or certificate to signed-in people only.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { getFile } from "@/lib/db/data";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const { id } = await ctx.params;
  const file = await getFile(id).catch(() => null);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const filename = file.name.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
    },
  });
}
