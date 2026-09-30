// One page of Customers (with filters), as JSON. The page shows the browser's saved copy first, then this.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { listCustomers } from "@/lib/crm/queries";
import { dbState } from "@/lib/db";
import { FINANCING, listReps, listSources, STATUSES } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { syncInfo } from "@/lib/leads/source";
import { dayKey } from "@/lib/utils/time";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
type Params = Record<string, string | undefined>;

export async function GET(req: NextRequest) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const params: Params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const search = (params.q ?? "").slice(0, 80).trim();
  const state = await dbState();
  const dbReady = state === "ready";
  const PER_PAGE = 50;
  const pageIndex = Math.max(0, Number(params.p ?? 0) || 0);

  const [list, reps, sources, sync] = dbReady
    ? await Promise.all([
        listCustomers({ search, rep: params.rep, status: params.status, fin: params.fin, scope: params.scope }, pageIndex, PER_PAGE),
        listReps(), listSources(), syncInfo(),
      ])
    : [{ customers: [], total: 0 }, [], [], null];
  const customers = list.customers;
  const pages = Math.max(1, Math.ceil(list.total / PER_PAGE));

  return NextResponse.json({
    state, dbReady, customers, total: list.total, pages, pageIndex, perPage: PER_PAGE, search,
    reps: reps.map((r) => ({ id: r.id, name: r.name })), sources: sources.map((s) => s.name), sync,
    statuses: STATUSES, financing: FINANCING, today: dayKey(Date.now(), dealership.timeZone),
  });
}
