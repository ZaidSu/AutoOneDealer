// CSV downloads for signed-in people: /api/export?kind=sales|purchases|expenses|invoices|taxes|contractor&year=2026[&id=...]
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { getData } from "@/lib/db/data";
import { buildExport, buildPackage } from "@/lib/exports";
import { makeZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const yearParam = req.nextUrl.searchParams.get("year") ?? "all";
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;

  const loaded = await getData();
  if (loaded.state !== "ready") return NextResponse.json({ error: "database not ready" }, { status: 503 });
  if (kind === "package") {
    if (year === null) return NextResponse.json({ error: "choose a year" }, { status: 400 });
    const pack = buildPackage(loaded.data, year);
    const enc = new TextEncoder();
    const zip = makeZip(pack.files.map((f) => ({ name: f.name, data: enc.encode(f.content) })));
    return new NextResponse(new Uint8Array(zip), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${pack.name}.zip"`, "Cache-Control": "no-store" },
    });
  }
  const out = buildExport(kind, loaded.data, year, req.nextUrl.searchParams.get("id") ?? undefined);
  if (!out) return NextResponse.json({ error: "unknown export" }, { status: 400 });
  return new NextResponse("\uFEFF" + toCsv(out.rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${out.name}.csv"`, "Cache-Control": "no-store" },
  });
}
