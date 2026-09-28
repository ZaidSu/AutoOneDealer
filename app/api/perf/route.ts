// Receives stopwatch notes from the browser and keeps the last 1,000 (a small table of numbers only).
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { readyDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
let tableReady = false;

export async function POST(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return new NextResponse(null, { status: 204 });
  const sql = await readyDb();
  if (!sql) return new NextResponse(null, { status: 204 });
  try {
    const n = JSON.parse((await req.text()).slice(0, 2000)) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.round(v), 600000) : null);
    if (!tableReady) {
      await sql`create table if not exists perf_log (id bigserial primary key, at timestamptz not null default now(), route text, kind text,
        connect int, server int, data int, browser int, total int, cold boolean, server_age_s int)`;
      await sql`alter table perf_log add column if not exists detail text`;
      tableReady = true;
    }
    await sql`insert into perf_log (route, kind, connect, server, data, browser, total, cold, server_age_s, detail)
      values (${String(n.route ?? "").replace(/\/customers\/.+/, "/customers/[key]").replace(/\/inbox\/.+/, "/inbox/[id]").slice(0, 60)},
        ${n.kind === "click" ? "click" : "refresh"}, ${num(n.connect)}, ${num(n.server)}, ${num(n.data)}, ${num(n.browser)},
        ${num(n.total)}, ${n.cold === true}, ${num(n.serverAgeS)}, ${typeof n.detail === "string" && n.detail ? n.detail.slice(0, 400) : null})`;
    if (Math.random() < 0.05) await sql`delete from perf_log where id < (select max(id) - 1000 from perf_log)`;
  } catch {
    // A stopwatch note is never worth an error.
  }
  return new NextResponse(null, { status: 204 });
}
