import type { Metadata } from "next";
import Link from "next/link";
import FollowUpItem from "@/components/dashboard/FollowUpItem";
import UnreadCount from "@/components/dashboard/UnreadCount";
import LeadList from "@/components/leads/LeadList";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { getStaffSession } from "@/lib/auth/session";
import { dbState } from "@/lib/db";
import { appointmentsBetween, followUps, leadCounts, listReps, type FollowUp } from "@/lib/db/data";
import { dealership, greeting } from "@/lib/dealership";
import { formatPhone } from "@/lib/format";
import { startOfDealershipDay } from "@/lib/gmail";
import { queryLeads } from "@/lib/leads/store";
import { addDays, dayKey, zonedToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const tz = dealership.timeZone;
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });

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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const staff = (await getStaffSession())!;
  const firstName = staff.name.split(" ")[0];
  const state = await dbState();
  const dbReady = state === "ready";
  const today = dayKey(Date.now(), tz);
  const repId = params.rep ? Number(params.rep) || null : null;

  // Everything here comes from the database in parallel. Gmail's unread count loads separately in the browser.
  const [reps, items, appointmentsToday, counts, latest] = dbReady
    ? await Promise.all([
        listReps(),
        followUps(today, repId),
        appointmentsBetween(zonedToUtc(today, "00:00", tz)!, zonedToUtc(addDays(today, 1), "00:00", tz)!, repId),
        leadCounts(new Date(startOfDealershipDay(tz) * 1000), new Date(Date.now() - 7 * 86400000)),
        queryLeads({ limit: 6 }).then((r) => r.leads),
      ])
    : [[], [], null, null, []];

  const total = items.length;
  const visibleAppointments = (appointmentsToday ?? []).filter((a) => a.status !== "canceled");

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description={dbReady ? (total ? `${total} ${total === 1 ? "person needs" : "people need"} a follow-up.` : "You're all caught up on follow-ups.") : "Here's what needs attention at the dealership."} />

      {counts && (
        <section aria-label="Counts" className="stat-strip mb-6 max-w-5xl lg:grid-cols-4">
          <Stat value={counts.leadsToday} label="New leads today" href="/leads?show=inquiry" highlight={counts.leadsToday > 0} />
          <Stat value={counts.appsToday} label="Credit applications today" href="/credit-applications" highlight={counts.appsToday > 0} />
          <Stat value={counts.week} label="Leads and applications, last 7 days" href="/leads" />
          <Link href="/inbox?view=unread" className="stat"><p className="stat-value"><UnreadCount /></p><p className="stat-label">Unread emails in the inbox</p></Link>
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
                    <span className="w-20 font-semibold tabular-nums">{timeFmt.format(a.startsAt)}</span>
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
