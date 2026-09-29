"use client";
// The Dashboard, drawn in the browser from its saved copy, then refreshed quietly in the background.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FollowUpItem from "@/components/dashboard/FollowUpItem";
import LeadList from "@/components/leads/LeadList";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import PageLoading from "@/components/ui/PageLoading";
import type { FollowUp } from "@/lib/db/data";
import { formatPhone } from "@/lib/format";
import type { Lead } from "@/lib/gmail";
import { useLive } from "@/lib/client/live";
import { dayKey } from "@/lib/time";

type Appt = { id: number; customerName: string; vehicle: string | null; phone: string | null; repName: string | null; status: string; startsAt: number };
type Data = {
  state: "ready" | "unreachable" | "not_configured"; dbReady: boolean; tz: string; greeting: string; firstName: string;
  repId: number | null; reps: { id: number; name: string }[]; items: FollowUp[]; latest: Lead[]; problems: string[];
  counts: { leadsToday: number; appsToday: number; week: number } | null; appointmentsToday: Appt[] | null;
};

let tz = "America/Chicago";
let timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
let dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
function setZone(zone: string) {
  if (zone !== tz) {
    tz = zone;
    timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
    dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  }
}
function ago(ms: number) {
  const minutes = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hr ago` : `${Math.round(hours / 24)} days ago`;
}

const GROUPS: { kind: FollowUp["kind"]; title: string; hint: string; limit: number; when: (f: FollowUp) => string; more?: string }[] = [
  { kind: "no_show", title: "Missed appointments", hint: "Call to reschedule.", limit: 10, when: (f) => `Missed ${dateFmt.format(f.at)} at ${timeFmt.format(f.at)}` },
  { kind: "unmarked", title: "Did they show up?", hint: "These appointments are over. Mark how they went.", limit: 10, when: (f) => `${dateFmt.format(f.at)} at ${timeFmt.format(f.at)}` },
  { kind: "reminder", title: "Follow-up reminders", hint: "Reminders set on a customer for today or earlier.", limit: 15, when: (f) => (dayKey(f.at, "UTC") < dayKey(Date.now(), tz) ? `Was due ${dateFmt.format(f.at)}` : "Due today") },
  { kind: "loan_app", title: "Loan apps waiting on review", hint: "Credit applications from the last 30 days without an Approved or Denied decision.", limit: 8, when: (f) => `Applied ${ago(f.at)}`, more: "/customers?fin=needs_review" },
  { kind: "new_lead", title: "New leads nobody has contacted", hint: "From the last 2 weeks, with no status, reminder or appointment yet.", limit: 8, when: (f) => `Came in ${ago(f.at)}`, more: "/customers?status=new" },
];


export default function DashboardView() {
  const search = useSearchParams();
  const repParam = search.get("rep");
  const { data, error } = useLive<Data>(`/api/dashboard${repParam ? `?rep=${encodeURIComponent(repParam)}` : ""}`);
  if (!data) return error ? <p role="alert" className="card max-w-2xl p-5 text-signal">Couldn&apos;t load the Dashboard: {error}. Check your connection and refresh.</p> : <PageLoading title="Dashboard" messages={["Checking today's leads…", "Counting credit applications…", "Looking for today's appointments…", "Almost there…"]} />;
  setZone(data.tz);
  const { state, dbReady, reps, items, counts, latest, problems, appointmentsToday, repId, firstName } = data;
  const total = items.length;
  const visibleAppointments = (appointmentsToday ?? []).filter((a) => a.status !== "canceled");

  return (
    <>
      <PageHeader title={`${data.greeting}, ${firstName}`} description={dbReady ? (total ? `${total} ${total === 1 ? "person needs" : "people need"} a follow-up.` : "You're all caught up on follow-ups.") : "Here's what needs attention at the dealership."} />

      {problems.length > 0 && (
        <div role="alert" className="mb-5 max-w-5xl rounded-lg border border-signal/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-semibold">Part of this page couldn&apos;t load. Refresh to try again; if it keeps happening, send this to your developer:</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {counts && (
        <section aria-label="Counts" className="stat-strip mb-6 max-w-5xl lg:grid-cols-4">
          <Stat value={counts.leadsToday} label="New leads today" href="/leads?show=inquiry" highlight={counts.leadsToday > 0} />
          <Stat value={counts.appsToday} label="Credit applications today" href="/credit-applications" highlight={counts.appsToday > 0} />
          <Stat value={counts.week} label="Leads and applications, last 7 days" href="/leads" />
          <Stat value={items.filter((i) => i.kind === "new_lead").length} label="Waiting on first contact" href="/pipeline" highlight={items.some((i) => i.kind === "new_lead")} />
        </section>
      )}

      {dbReady && reps.length > 0 && (
        <nav aria-label="Salesperson" className="segmented mb-4">
          <Link href="/dashboard" aria-current={!repId ? "page" : undefined}>Everyone</Link>
          {reps.map((r) => (
            <Link key={r.id} href={`/dashboard?rep=${r.id}`} aria-current={repId === r.id ? "page" : undefined}>{r.name}</Link>
          ))}
        </nav>
      )}

      <div className="grid max-w-5xl gap-6">
        {!dbReady ? (
          <DbNotice state={state} what="The follow-up list" />
        ) : total === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-white p-5 text-muted">
            Nothing to follow up on{repId ? " for this salesperson" : ""}. New leads, missed appointments and reminders will show up here.
          </p>
        ) : (
          GROUPS.map((group) => {
            const list = items.filter((i) => i.kind === group.kind);
            if (list.length === 0) return null;
            return (
              <section key={group.kind} aria-labelledby={`fu-${group.kind}`}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                  <h2 id={`fu-${group.kind}`} className="text-lg font-semibold">
                    {group.title} <span className="text-signal tabular-nums">{list.length}</span>
                  </h2>
                  <p className="text-sm text-muted">{group.hint}</p>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                  {list.slice(0, group.limit).map((item) => (
                    <FollowUpItem key={`${item.kind}-${item.appointmentId ?? item.key}`} item={item} when={group.when(item)} />
                  ))}
                </ul>
                {list.length > group.limit && group.more && (
                  <Link href={group.more} className="mt-2 inline-block text-sm font-semibold text-signal hover:underline">See all {list.length}</Link>
                )}
              </section>
            );
          })
        )}

        {appointmentsToday && (
          <section aria-labelledby="today-appts" className="rounded-lg border border-line bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 id="today-appts" className="text-lg font-semibold">Today&apos;s appointments</h2>
              <Link href="/appointments" className="text-sm font-semibold text-signal hover:underline">All appointments</Link>
            </div>
            {visibleAppointments.length === 0 ? (
              <p className="mt-2 text-muted">Nothing booked for today.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {visibleAppointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-20 font-semibold tabular-nums">{timeFmt.format(new Date(a.startsAt))}</span>
                    <span className="font-semibold">{a.customerName}</span>
                    <span className="text-muted">{[a.vehicle, a.phone && formatPhone(a.phone)].filter(Boolean).join(" · ")}</span>
                    <span className="ml-auto text-sm text-muted">{a.repName ?? "No salesperson"}{a.status !== "scheduled" ? ` · ${a.status === "showed" ? "showed up" : "no-show"}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {dbReady && (
          <section aria-labelledby="latest">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="latest" className="text-lg font-semibold">Newest leads</h2>
              <Link href="/leads" className="text-sm font-semibold text-signal hover:underline">See all leads</Link>
            </div>
            {latest.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-muted">No leads yet.</p> : <LeadList leads={latest} />}
          </section>
        )}
      </div>
    </>
  );
}

function Stat({ value, label, href, highlight }: { value: number; label: string; href: string; highlight?: boolean }) {
  return (
    <Link href={href} className="stat">
      <p className={`stat-value ${highlight ? "text-signal" : ""}`}>{value.toLocaleString()}</p>
      <p className="stat-label">{label}</p>
    </Link>
  );
}
