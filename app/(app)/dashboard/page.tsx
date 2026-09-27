import type { Metadata } from "next";
import Link from "next/link";
import FollowUpItem from "@/components/dashboard/FollowUpItem";
import GmailState from "@/components/gmail/GmailState";
import LeadList from "@/components/leads/LeadList";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { getStaffSession } from "@/lib/auth/session";
import { dbState } from "@/lib/db";
import { appointmentsBetween, followUps, leadCounts, listReps, type FollowUp } from "@/lib/db/data";
import { dealership, greeting } from "@/lib/dealership";
import { formatPhone } from "@/lib/format";
import { fetchLeads, LEAD_QUERIES, startOfDealershipDay, withGmail } from "@/lib/gmail";
import { syncInBackground } from "@/lib/leads/background";
import { queryLeads } from "@/lib/leads/store";
import { addDays, dayKey, zonedToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  if (dbReady) await syncInBackground();

  const [reps, items, appointmentsToday, counts] = dbReady
    ? await Promise.all([
        listReps(),
        followUps(today, repId),
        appointmentsBetween(zonedToUtc(today, "00:00", tz)!, zonedToUtc(addDays(today, 1), "00:00", tz)!, repId),
        leadCounts(new Date(startOfDealershipDay(tz) * 1000), new Date(Date.now() - 7 * 86400000)),
      ])
    : [[], [], null, null];

  // Without the database, counts and newest leads come straight from Gmail.
  const gmail = await withGmail(async (g) => {
    const todayQuery = `after:${startOfDealershipDay(tz)}`;
    const [unread, latest, fallback] = await Promise.all([
      g.inboxUnread(),
      dbReady ? queryLeads({ limit: 6 }).then((r) => r.leads) : fetchLeads(g, { max: 6 }).then((r) => r.leads),
      counts
        ? Promise.resolve(null)
        : Promise.all([
            g.count(`${LEAD_QUERIES.inquiry} ${todayQuery}`),
            g.count(`${LEAD_QUERIES.application} ${todayQuery}`),
            g.count(`${LEAD_QUERIES.all} newer_than:7d`),
          ]).then(([leadsToday, appsToday, week]) => ({ leadsToday, appsToday, week })),
    ]);
    return { unread, latest, counts: counts ?? fallback! };
  });

  const total = items.length;
  const visibleAppointments = (appointmentsToday ?? []).filter((a) => a.status !== "canceled");

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description={dbReady ? (total ? `${total} ${total === 1 ? "person needs" : "people need"} a follow-up.` : "You're all caught up on follow-ups.") : "Here's what needs attention at the dealership."} />

      {gmail.status === "ok" && (
        <section aria-label="Counts" className="mb-6 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
          <Stat value={gmail.data.counts.leadsToday} label="New leads today" href="/leads?show=inquiry" highlight={gmail.data.counts.leadsToday > 0} />
          <Stat value={gmail.data.counts.appsToday} label="Credit applications today" href="/credit-applications" highlight={gmail.data.counts.appsToday > 0} />
          <Stat value={gmail.data.counts.week} label="Leads and applications, last 7 days" href="/leads" />
          <Stat value={gmail.data.unread} label="Unread emails in the inbox" href="/inbox?view=unread" />
        </section>
      )}
      {gmail.status !== "ok" && !dbReady && <div className="mb-6"><GmailState {...gmail} /></div>}

      {dbReady && reps.length > 0 && (
        <nav aria-label="Salesperson" className="mb-4 flex w-fit flex-wrap rounded-md bg-white p-1 ring-1 ring-line">
          <Link href="/dashboard" className={`rounded px-3 py-1.5 text-sm font-medium ${!repId ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}>Everyone</Link>
          {reps.map((r) => (
            <Link key={r.id} href={`/dashboard?rep=${r.id}`} className={`rounded px-3 py-1.5 text-sm font-medium ${repId === r.id ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}>{r.name}</Link>
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

        {gmail.status === "ok" && (
          <section aria-labelledby="latest">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="latest" className="text-lg font-semibold">Newest leads</h2>
              <Link href="/leads" className="text-sm font-semibold text-signal hover:underline">See all leads</Link>
            </div>
            {gmail.data.latest.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-muted">No leads yet.</p> : <LeadList leads={gmail.data.latest} />}
          </section>
        )}
      </div>
    </>
  );
}

function Stat({ value, label, href, highlight }: { value: number; label: string; href: string; highlight?: boolean }) {
  return (
    <Link href={href} className="bg-white p-5 hover:bg-paper">
      <p className={`text-3xl font-semibold tabular-nums ${highlight ? "text-signal" : ""}`}>{value >= 500 ? "500+" : value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </Link>
  );
}
