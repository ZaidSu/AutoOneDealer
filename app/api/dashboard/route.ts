// Everything the Dashboard shows, as JSON. The page shows the browser's saved copy first, then this.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { dbState } from "@/lib/db";
import { appointmentsBetween, followUps, leadCounts, listReps, type FollowUp } from "@/lib/db/data";
import { dealership, greeting } from "@/lib/dealership";
import { startOfDealershipDay } from "@/lib/gmail";
import { queryLeads } from "@/lib/leads/store";
import { attempt } from "@/lib/safe";
import { addDays, dayKey, zonedToUtc } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
const tz = dealership.timeZone;

export async function GET(req: NextRequest) {
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const params = { rep: req.nextUrl.searchParams.get("rep") ?? undefined };
  const state = await dbState();
  const dbReady = state === "ready";
  const today = dayKey(Date.now(), tz);
  const repId = params.rep ? Number(params.rep) || null : null;

  // Everything here comes from the database, in parallel. Each part loads on its own, so one problem
  // can't take the whole page down; if a part fails, the reason is shown at the top.
  const dayStart = new Date(startOfDealershipDay(tz) * 1000);
  const [repsR, itemsR, apptsR, countsR, latestR] = dbReady
    ? await Promise.all([
        attempt("Salespeople", () => listReps(), []),
        attempt("Follow-ups", () => followUps(today, repId), [] as FollowUp[]),
        attempt("Today's appointments", async () => appointmentsBetween(zonedToUtc(today, "00:00", tz)!, zonedToUtc(addDays(today, 1), "00:00", tz)!, repId), null),
        attempt("Counts", () => leadCounts(dayStart, new Date(Date.now() - 7 * 86400000)), null),
        attempt("Newest leads", async () => (await queryLeads({ limit: 6 })).leads, []),
      ])
    : [];
  const reps = repsR?.data ?? [];
  const items = itemsR?.data ?? [];
  const appointmentsToday = apptsR?.data ?? null;
  const counts = countsR?.data ?? null;
  const latest = latestR?.data ?? [];
  const problems = [repsR, itemsR, apptsR, countsR, latestR].map((r) => r?.error).filter(Boolean) as string[];

  return NextResponse.json({
    state, dbReady, tz, greeting: greeting(), firstName: staff.name.split(" ")[0], repId,
    reps: reps.map((r) => ({ id: r.id, name: r.name })), items, counts, latest, problems,
    appointmentsToday: appointmentsToday?.map((a) => ({ ...a, startsAt: a.startsAt.getTime(), endsAt: undefined })) ?? null,
  });
}
