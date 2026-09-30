// Everything the Dashboard shows, as JSON: today's appointments and what came in since last night.
// The page shows the browser's saved copy first, then this.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { dbState } from "@/lib/db";
import { appointmentsBetween, leadCounts } from "@/lib/db/data";
import { dealership, greeting } from "@/lib/dealership";
import { queryLeads } from "@/lib/leads/store";
import { aiConfigured } from "@/lib/ai/claude";
import { replyCounts } from "@/lib/ai/replies";
import { attempt } from "@/lib/utils/safe";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
const tz = dealership.timeZone;

export async function GET(req: NextRequest) {
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const state = await dbState();
  const dbReady = state === "ready";
  const today = dayKey(Date.now(), tz);
  // "Since last night": from 6 PM the day before (the store closes at 7 PM), Dallas time.
  const since = zonedToUtc(addDays(today, -1), dealership.overnightFrom, tz)!;
  const dayStart = zonedToUtc(today, "00:00", tz)!;
  const dayEnd = zonedToUtc(addDays(today, 1), "00:00", tz)!;

  // Each part loads on its own, so one problem can't take the whole page down.
  const [apptsR, countsR, latestR, aiR] = dbReady
    ? await Promise.all([
        attempt("Today's appointments", () => appointmentsBetween(dayStart, dayEnd, null), null),
        attempt("Counts", () => leadCounts(since, since), null),
        attempt("Latest leads", async () => (await queryLeads({ since, limit: 30 })).leads, []),
        attempt("AI replies", () => replyCounts(since), { waiting: 0, sent: 0 }),
      ])
    : [];
  const problems = [apptsR, countsR, latestR].map((r) => r?.error).filter(Boolean) as string[];
  const counts = countsR?.data ?? null;

  return NextResponse.json({
    state, dbReady, tz, greeting: greeting(), firstName: staff.name.split(" ")[0], problems,
    since: since.getTime(),
    counts: counts ? { leads: counts.leadsToday, applications: counts.appsToday } : null,
    latest: latestR?.data ?? [],
    appointmentsToday: apptsR?.data?.filter((a) => a.status !== "canceled").map((a) => ({ ...a, startsAt: a.startsAt.getTime(), endsAt: undefined })) ?? null,
    // Texts come later; emails are real once the AI key is set.
    ai: { enabled: aiConfigured(), emails: aiR?.data?.sent ?? 0, waiting: aiR?.data?.waiting ?? 0, texts: 0 },
  });
}
