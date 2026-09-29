import { requirePageStaff } from "@/lib/auth/guard";
import type { Metadata } from "next";
import Link from "next/link";
import { BarList, Columns, Panel, Stat } from "@/components/analytics/Charts";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { analytics, type AnalyticsData } from "@/lib/crm/analytics";
import { dbState } from "@/lib/db";
import { listReps } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { stateName } from "@/lib/geo";
import { addDays, dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months" } as const;
type Range = keyof typeof RANGES;
const tz = dealership.timeZone;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageStaff();
  const params = await searchParams;
  const range: Range = params.range && params.range in RANGES ? (params.range as Range) : "30";
  const days = Number(range);
  const state = await dbState();
  const dbReady = state === "ready";
  const since = new Date(Date.now() - days * 86400000);

  const header = (
    <>
      <PageHeader title="Analytics" description="Where customers come from and what happens next. Every number comes from real lead emails and what your team has recorded." />
      <nav aria-label="Date range" className="segmented mb-6">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={`/analytics?range=${r}`} aria-current={range === r ? "page" : undefined}>{RANGES[r]}</Link>
        ))}
      </nav>
    </>
  );
  if (!dbReady) return <>{header}<DbNotice state={state} what="Analytics" /></>;
  const [data, reps] = await Promise.all([analytics(since, tz), listReps(true)]);
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
  const today = dayKey(Date.now(), tz);
  const sumDays = (test: (d: string) => boolean) => { let n = 0; for (const [d, c] of data.leadsByDay) if (test(d)) n += c; return n; };
  const buckets: { label: string; value: number }[] = [];
  if (days <= 30) {
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      buckets.push({ label: d.slice(5).replace("-", "/"), value: data.leadsByDay.get(d) ?? 0 });
    }
  } else if (days <= 90) {
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
  const purchased = sum((p) => p.status === "purchased");
  const purchasesBySource = tally((p) => p.status === "purchased", (p) => p.source);
  const appts = (repId: number, status?: string) => data.appointments.reduce((n, a) => n + (a.repId === repId && (!status || a.status === status) ? a.n : 0), 0);
  const repRows = reps.filter((r) => r.active || sum((p) => p.repId === r.id) > 0).map((r) => ({
    name: r.name,
    customers: sum((p) => p.repId === r.id),
    booked: appts(r.id),
    showed: appts(r.id, "showed"),
    noShow: appts(r.id, "no_show"),
    purchased: sum((p) => p.repId === r.id && p.status === "purchased"),
  }));

  return (
    <>
      {header}

      <section aria-label="Totals" className="mb-6 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat value={people} label="Customers who reached out" />
        <Stat value={emails} label="Lead emails received" />
        <Stat value={applications} label="Credit applications" />
        <Stat value={purchased} label="Marked purchased" />
      </section>

      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <Panel title="Where customers came from" note="People, not emails. Uses the “Heard about us” label, which lead emails fill in automatically. The gray number is how many emails that source sent." wide>
          <BarList items={bySource} emptyText="No leads in this range." />
        </Panel>

        <Panel title="In state vs out of state" note="From the city and state in each lead, or the label your team set.">
          <BarList highlightFirst={false} items={[
            { label: "In state (Texas)", value: inState },
            { label: "Out of state", value: outState },
            { label: "Not known", value: people - inState - outState },
          ]} emptyText="No leads in this range." />
        </Panel>

        <Panel title="Out-of-state customers by state" note="Only customers marked out of state.">
          <BarList items={topStates} emptyText="No out-of-state customers in this range." />
        </Panel>

        <Panel title={days <= 30 ? "Leads per day" : days <= 90 ? "Leads per week" : "Leads per month"} note="Every lead and credit application email, by the day it arrived (Dallas time)." wide>
          <Columns items={buckets} emptyText="No leads in this range." />
        </Panel>

        <Panel title="Credit applications" note="Received means the application arrived; it isn't an approval. Approved and denied come from the Financing label.">
          <BarList highlightFirst={false} items={[
            { label: "Received", value: applications },
            { label: "Approved", value: approved },
            { label: "Denied", value: denied },
            { label: "Still needs review", value: applications - approved - denied },
          ]} emptyText="No credit applications in this range." />
        </Panel>

        <Panel title="Which sources lead to purchases" note="Customers marked Purchased, by where they heard about us.">
          {dbReady ? <BarList items={purchasesBySource} emptyText="No purchases marked in this range yet." /> : <DbNotice state={state} what="This chart" />}
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
                  <tbody>{repRows.map((r) => (
                    <tr key={r.name} className="border-b border-line tabular-nums last:border-0">
                      <td className="py-2 pr-4 font-semibold">{r.name}</td><td className="py-2 pr-4">{r.customers}</td>
                      <td className="py-2 pr-4">{r.booked}</td><td className="py-2 pr-4">{r.showed}</td>
                      <td className="py-2 pr-4">{r.noShow}</td><td className="py-2">{r.purchased}</td>
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
