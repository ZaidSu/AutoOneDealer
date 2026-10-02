import { requirePageStaff } from "@/lib/auth/guard";
import type { Metadata } from "next";
import Link from "next/link";
import { BarList, Columns, Panel, SplitBar, Stat, stateColor } from "@/components/analytics/Charts";
import ReviewsSection from "@/components/analytics/ReviewsSection";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { analytics, type AnalyticsData } from "@/lib/crm/analytics";
import { dbState, fresh } from "@/lib/db";
import { listReps } from "@/lib/db/data";
import { dataStartLabel, dealership, notBeforeStart } from "@/lib/dealership";
import { reviewStats, syncReviews } from "@/lib/reviews/store";
import { stateName } from "@/lib/utils/geo";
import { sourceColor } from "@/lib/utils/sourceColors";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";

const REP_COLORS = ["#1c7ed6", "#7048e8", "#0ca678", "#f08c00", "#e64980", "#15aabf"];

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const RANGES = { "1": "Today", "7": "Last 7 days", "30": "Last 30 days", all: "Everything" } as const;
type Range = keyof typeof RANGES;
const tz = dealership.timeZone;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageStaff();
  const params = await searchParams;
  const range: Range = params.range && params.range in RANGES ? (params.range as Range) : "all";
  const state = await dbState();
  const dbReady = state === "ready";
  // Whole days in Dallas time (not "the last 168 hours"), and never before the data start.
  const today = dayKey(Date.now(), tz);
  const firstDay = range === "all" ? dealership.dataStart : [addDays(today, 1 - Number(range)), dealership.dataStart].sort()[1];
  const since = notBeforeStart(zonedToUtc(firstDay, "00:00", tz));
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(firstDay)) / 86400000) + 1);

  const header = (
    <>
      <PageHeader title="Analytics" description={`Where customers come from and what happens next, counted from lead emails since ${dataStartLabel()} and what your team has recorded.`} />
      <nav aria-label="Date range" className="segmented mb-6">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={`/analytics?range=${r}`} aria-current={range === r ? "page" : undefined}>{RANGES[r]}</Link>
        ))}
      </nav>
    </>
  );
  if (!dbReady) return <>{header}<DbNotice state={state} what="Analytics" /></>;
  // Pick up any new review emails (at most every 30 minutes; the first time it reads them all). Never holds the page up for long.
  await Promise.race([syncReviews().catch(() => undefined), new Promise((r) => setTimeout(r, 9000))]);
  const reviews = await reviewStats(tz).catch(() => null);
  const [data, reps] = await fresh("Analytics", () => Promise.all([analytics(since, tz), listReps(true)]));
  if (!data) return <>{header}<DbNotice state={state} what="Analytics" /></>;

  type P = AnalyticsData["people"][number];
  const rows = data.people;
  const sum = (test: (p: P) => boolean) => rows.reduce((n, p) => n + (test(p) ? p.n : 0), 0);
  const tally = (test: (p: P) => boolean, label: (p: P) => string) => {
    const m = new Map<string, number>();
    for (const p of rows) if (test(p)) m.set(label(p), (m.get(label(p)) ?? 0) + p.n);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);
  };

  const people = sum(() => true);
  const emails = [...data.emailsByProvider.values()].reduce((n, v) => n + v, 0);
  const bySource = tally(() => true, (p) => p.source).map((i) => ({
    ...i,
    note: data.emailsByProvider.has(i.label) && data.emailsByProvider.get(i.label) !== i.value ? `(${data.emailsByProvider.get(i.label)} emails)` : undefined,
  }));
  const inState = sum((p) => p.scope === "in");
  const outState = sum((p) => p.scope === "out");
  const topStates = tally((p) => p.scope === "out", (p) => (p.state ? stateName(p.state) : "State not given")).slice(0, 8);

  // Leads over time: by day for short ranges, by week for 90 days, by month for a year.
  const sumDays = (test: (d: string) => boolean) => { let n = 0; for (const [d, c] of data.leadsByDay) if (test(d)) n += c; return n; };
  const buckets: { label: string; value: number }[] = [];
  if (days <= 45) {
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      buckets.push({ label: d.slice(5).replace("-", "/"), value: data.leadsByDay.get(d) ?? 0 });
    }
  } else if (days <= 120) {
    for (let w = Math.ceil(days / 7) - 1; w >= 0; w--) {
      const end = addDays(today, -w * 7), start = addDays(end, -6);
      buckets.push({ label: start.slice(5).replace("-", "/"), value: sumDays((d) => d >= start && d <= end) });
    }
  } else {
    for (let m = 11; m >= 0; m--) {
      const [y, mo] = today.split("-").map(Number);
      const date = new Date(Date.UTC(y, mo - 1 - m, 1));
      const prefix = date.toISOString().slice(0, 7);
      buckets.push({ label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), value: sumDays((d) => d.startsWith(prefix)) });
    }
  }

  const applications = sum((p) => p.hasApp);
  const approved = sum((p) => p.hasApp && p.financing === "approved");
  const denied = sum((p) => p.hasApp && p.financing === "denied");
  const purchased = data.purchases.reduce((n, p) => n + p.n, 0);
  const purchaseMap = new Map<string, number>();
  for (const p of data.purchases) purchaseMap.set(p.source, (purchaseMap.get(p.source) ?? 0) + p.n);
  const purchasesBySource = [...purchaseMap.entries()].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);
  const appts = (repId: number, status?: string) => data.appointments.reduce((n, a) => n + (a.repId === repId && (!status || a.status === status) ? a.n : 0), 0);
  const repRows = reps.filter((r) => r.active || sum((p) => p.repId === r.id) > 0).map((r) => ({
    name: r.name,
    customers: sum((p) => p.repId === r.id),
    booked: appts(r.id),
    showed: appts(r.id, "showed"),
    noShow: appts(r.id, "no_show"),
    purchased: data.purchases.reduce((n, p) => n + (p.repId === r.id ? p.n : 0), 0),
  }));

  return (
    <>
      {header}

      <section aria-label="Totals" className="mb-6 grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value={people} label="Customers" sub="reached out" color="#1c7ed6" />
        <Stat value={emails} label="Lead emails" sub={people ? `about ${(emails / people).toFixed(1)} per customer` : "received"} color="#7048e8" />
        <Stat value={applications} label="Applied for credit" sub={people ? `${Math.round((applications / people) * 100)}% of customers` : "people"} color="#f08c00" />
        <Stat value={purchased} label="Purchased" sub={people ? `${Math.round((purchased / Math.max(people, 1)) * 100)}% of customers` : "marked by your team"} color="#0ca678" />
      </section>

      <ReviewsSection stats={reviews} />

      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <Panel title="Where customers came from" note="People, not emails. Uses the “Heard about us” label, which lead emails fill in automatically. The gray number is how many emails that source sent." wide>
          <BarList items={bySource} colorFor={sourceColor} emptyText="No leads in this range." />
        </Panel>

        <Panel title="In state vs out of state" note="From the city and state in each lead, or the label your team set.">
          <SplitBar parts={[
            { label: "Texas", value: inState, color: "#1c7ed6" },
            { label: "Out of state", value: outState, color: "#f08c00" },
            { label: "Not known", value: people - inState - outState, color: "#ced4da" },
          ]} emptyText="No leads in this range." />
        </Panel>

        <Panel title="Out-of-state customers by state" note="Only customers marked out of state.">
          <BarList items={topStates} colorFor={stateColor} emptyText="No out-of-state customers in this range." />
        </Panel>

        <Panel title={days <= 45 ? "Leads per day" : days <= 120 ? "Leads per week" : "Leads per month"} note={`Every lead and credit application email, by the day it arrived (Dallas time).${days <= 45 ? " Today is in red." : ""} About ${Math.round(emails / Math.max(days, 1))} a day on average.`} wide>
          <Columns items={buckets} color="#4c6ef5" highlightLast={days <= 45} emptyText="No leads in this range." />
        </Panel>

        <Panel title="Credit applications" note="Received means the application arrived; it isn't an approval. Approved and denied come from the Financing label.">
          <p className="mb-3 text-[15px]"><span className="font-condensed text-3xl font-semibold" style={{ color: "#f08c00" }}>{applications}</span> <span className="text-muted">received</span></p>
          <SplitBar parts={[
            { label: "Approved", value: approved, color: "#0ca678" },
            { label: "Denied", value: denied, color: "#e03131" },
            { label: "Still needs review", value: applications - approved - denied, color: "#fab005" },
          ]} emptyText="No credit applications in this range." />
        </Panel>

        <Panel title="Which sources lead to purchases" note="Customers marked Purchased in this range, by where they heard about us.">
          {dbReady ? <BarList items={purchasesBySource} colorFor={sourceColor} emptyText="No purchases marked in this range yet." /> : <DbNotice state={state} what="This chart" />}
        </Panel>

        <Panel title="Salespeople" note="Customers assigned, appointments in this range and how they went, and customers marked purchased." wide>
          {dbReady ? (
            repRows.length === 0 ? <p className="text-sm text-muted">No salespeople yet. Add them in Settings.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[15px]">
                  <thead className="text-sm text-muted"><tr className="border-b border-line">
                    <th className="py-2 pr-4 font-medium">Salesperson</th><th className="py-2 pr-4 font-medium">Customers</th>
                    <th className="py-2 pr-4 font-medium">Appointments</th><th className="py-2 pr-4 font-medium">Showed up</th>
                    <th className="py-2 pr-4 font-medium">No-shows</th><th className="py-2 font-medium">Purchased</th>
                  </tr></thead>
                  <tbody>{repRows.map((r, i) => (
                    <tr key={r.name} className="border-b border-line tabular-nums last:border-0">
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-2.5 font-semibold">
                          <span aria-hidden className="grid size-8 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: REP_COLORS[i % REP_COLORS.length] }}>{r.name.slice(0, 1).toUpperCase()}</span>
                          {r.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">{r.customers}</td>
                      <td className="py-2.5 pr-4">{r.booked}</td>
                      <td className="py-2.5 pr-4"><span className="text-go">{r.showed}</span>{r.booked ? <span className="ml-1.5 text-sm text-muted">{Math.round((r.showed / r.booked) * 100)}%</span> : null}</td>
                      <td className="py-2.5 pr-4"><span className={r.noShow ? "text-signal" : ""}>{r.noShow}</span></td>
                      <td className="py-2.5 font-semibold">{r.purchased}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )
          ) : <DbNotice state={state} what="Salesperson results" />}
        </Panel>
      </div>
    </>
  );
}
