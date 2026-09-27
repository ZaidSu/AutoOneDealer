import type { Metadata } from "next";
import Link from "next/link";
import { BarList, Columns, Panel, Stat } from "@/components/analytics/Charts";
import GmailState from "@/components/gmail/GmailState";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { buildCustomerViews } from "@/lib/customer-view";
import { groupCustomers } from "@/lib/customers";
import { dbState } from "@/lib/db";
import { appointmentsBetween, customerRecords, listReps } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { stateName } from "@/lib/geo";
import SyncBar from "@/components/leads/SyncBar";
import { loadAllLeads } from "@/lib/leads/source";
import { addDays, dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months" } as const;
type Range = keyof typeof RANGES;
const LIMIT = 400;
const tz = dealership.timeZone;

function countBy<T>(items: T[], key: (item: T) => string | null) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const range: Range = params.range && params.range in RANGES ? (params.range as Range) : "30";
  const days = Number(range);
  const state = await dbState();
  const dbReady = state === "ready";

  const since = new Date(Date.now() - days * 86400000);
  const result = await loadAllLeads({ since, gmailLimit: LIMIT, gmailExtra: `newer_than:${days}d` });

  const header = (
    <>
      <PageHeader title="Analytics" description="Where customers come from and what happens next. Every number comes from real lead emails and what your team has recorded." />
      <nav aria-label="Date range" className="mb-6 flex w-fit flex-wrap rounded-md bg-white p-1 ring-1 ring-line">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={{ pathname: "/analytics", query: { range: r } }} aria-current={range === r ? "page" : undefined}
            className={`rounded px-3 py-1.5 text-sm font-medium ${range === r ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}>{RANGES[r]}</Link>
        ))}
      </nav>
    </>
  );
  if (result.status !== "ok") return <>{header}<GmailState {...result} /></>;

  const leads = result.data.leads;
  const grouped = groupCustomers(leads);
  const [reps, records] = dbReady ? await Promise.all([listReps(true), customerRecords(grouped.map((c) => c.key))]) : [[], new Map()];
  const views = buildCustomerViews(grouped, records, reps, new Map());
  const appointments = dbReady ? await appointmentsBetween(since, new Date(Date.now() + 1)) : [];

  // Where people came from (people, not emails), with how many lead emails each source sent.
  const leadsBySource = new Map(countBy(leads, (l) => l.provider).map((i) => [i.label, i.value]));
  const bySource = countBy(views, (v) => v.heardFrom ?? "Not known").map((i) => ({
    ...i,
    note: leadsBySource.has(i.label) && leadsBySource.get(i.label) !== i.value ? `(${leadsBySource.get(i.label)} emails)` : undefined,
  }));

  const inState = views.filter((v) => v.scope === "in").length;
  const outState = views.filter((v) => v.scope === "out").length;
  const unknownState = views.length - inState - outState;
  const topStates = countBy(views.filter((v) => v.scope === "out"), (v) => (v.stateCode ? stateName(v.stateCode) : "State not given")).slice(0, 8);

  // Leads over time: by day for short ranges, by week for 90 days, by month for a year.
  const today = dayKey(Date.now(), tz);
  const buckets: { label: string; value: number }[] = [];
  if (days <= 30) {
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      buckets.push({ label: d.slice(5).replace("-", "/"), value: leads.filter((l) => dayKey(l.receivedAt, tz) === d).length });
    }
  } else if (days <= 90) {
    for (let w = Math.ceil(days / 7) - 1; w >= 0; w--) {
      const end = addDays(today, -w * 7), start = addDays(end, -6);
      buckets.push({ label: start.slice(5).replace("-", "/"), value: leads.filter((l) => { const d = dayKey(l.receivedAt, tz); return d >= start && d <= end; }).length });
    }
  } else {
    for (let m = 11; m >= 0; m--) {
      const [y, mo] = today.split("-").map(Number);
      const date = new Date(Date.UTC(y, mo - 1 - m, 1));
      const prefix = date.toISOString().slice(0, 7);
      buckets.push({ label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), value: leads.filter((l) => dayKey(l.receivedAt, tz).startsWith(prefix)).length });
    }
  }

  const applications = views.filter((v) => v.hasApplication);
  const approved = applications.filter((v) => v.financing === "approved").length;
  const denied = applications.filter((v) => v.financing === "denied").length;
  const purchased = views.filter((v) => v.status === "purchased");
  const purchasesBySource = countBy(purchased, (v) => v.heardFrom ?? "Not known");
  const capped = result.mode === "gmail" && result.data.more;

  const repRows = reps.filter((r) => r.active || views.some((v) => v.repId === r.id)).map((r) => {
    const mine = views.filter((v) => v.repId === r.id);
    const appts = appointments.filter((a) => a.repId === r.id);
    return {
      name: r.name,
      customers: mine.length,
      booked: appts.length,
      showed: appts.filter((a) => a.status === "showed").length,
      noShow: appts.filter((a) => a.status === "no_show").length,
      purchased: mine.filter((v) => v.status === "purchased").length,
    };
  });

  return (
    <>
      {header}
      {result.sync && <SyncBar {...result.sync} />}
      {capped && (
        <p className="mb-4 max-w-3xl rounded-md border border-line bg-white px-4 py-3 text-sm text-muted">
          This range has more than {LIMIT} lead emails, so these charts use the newest {LIMIT}. Pick a shorter range for exact numbers.
        </p>
      )}

      <section aria-label="Totals" className="mb-6 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat value={views.length} label="Customers who reached out" />
        <Stat value={leads.length} label="Lead emails received" />
        <Stat value={applications.length} label="Credit applications" />
        <Stat value={dbReady ? purchased.length : "—"} label="Marked purchased" />
      </section>

      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <Panel title="Where customers came from" note="People, not emails. Uses the “Heard about us” label, which lead emails fill in automatically. The gray number is how many emails that source sent." wide>
          <BarList items={bySource} emptyText="No leads in this range." />
        </Panel>

        <Panel title="In state vs out of state" note="From the city and state in each lead, or the label your team set.">
          <BarList highlightFirst={false} items={[
            { label: "In state (Texas)", value: inState },
            { label: "Out of state", value: outState },
            { label: "Not known", value: unknownState },
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
            { label: "Received", value: applications.length },
            { label: "Approved", value: approved },
            { label: "Denied", value: denied },
            { label: "Still needs review", value: applications.length - approved - denied },
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
