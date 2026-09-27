import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import LeadList from "@/components/leads/LeadList";
import PageHeader from "@/components/ui/PageHeader";
import { getStaffSession } from "@/lib/auth/session";
import { dealership, greeting } from "@/lib/dealership";
import { fetchLeads, LEAD_QUERIES, startOfDealershipDay, withGmail } from "@/lib/gmail";
import { dbState } from "@/lib/db";
import { syncInBackground } from "@/lib/leads/background";
import { queryLeads } from "@/lib/leads/store";
import { appointmentsBetween, type Appointment } from "@/lib/db/data";
import { formatPhone } from "@/lib/format";
import { addDays, dayKey, zonedToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DashboardPage() {
  const staff = (await getStaffSession())!;
  const firstName = staff.name.split(" ")[0];

  const today = dayKey(Date.now(), dealership.timeZone);
  const dbReady = (await dbState()) === "ready";
  if (dbReady) await syncInBackground();
  const appointmentsToday: Appointment[] | null =
    dbReady
      ? await appointmentsBetween(zonedToUtc(today, "00:00", dealership.timeZone)!, zonedToUtc(addDays(today, 1), "00:00", dealership.timeZone)!)
      : null;
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: dealership.timeZone });

  const result = await withGmail(async (gmail) => {
    const today = `after:${startOfDealershipDay(dealership.timeZone)}`;
    // Counts only list message IDs, so they stay fast even on busy days.
    const [leadsToday, appsToday, leadsWeek, unread, latest] = await Promise.all([
      gmail.count(`${LEAD_QUERIES.inquiry} ${today}`),
      gmail.count(`${LEAD_QUERIES.application} ${today}`),
      gmail.count(`${LEAD_QUERIES.all} newer_than:7d`),
      gmail.inboxUnread(),
      dbReady ? queryLeads({ limit: 6 }) : fetchLeads(gmail, { max: 6 }),
    ]);
    return { leadsToday, appsToday, leadsWeek, unread, latest: latest.leads };
  });

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description="Here's what needs attention at the dealership." />

      {appointmentsToday && (
        <section aria-labelledby="today-appts" className="mb-6 max-w-5xl rounded-lg border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 id="today-appts" className="text-lg font-semibold">Today&apos;s appointments</h2>
            <Link href="/appointments" className="text-sm font-semibold text-signal hover:underline">All appointments</Link>
          </div>
          {appointmentsToday.filter((a) => a.status !== "canceled").length === 0 ? (
            <p className="mt-2 text-muted">Nothing booked for today.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {appointmentsToday.filter((a) => a.status !== "canceled").map((a) => (
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

      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : (
        <>
          <section aria-label="Counts" className="grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
            <Stat value={result.data.leadsToday} label="New leads today" href="/leads?show=inquiry" highlight={result.data.leadsToday > 0} />
            <Stat value={result.data.appsToday} label="Credit applications today" href="/credit-applications" highlight={result.data.appsToday > 0} />
            <Stat value={result.data.leadsWeek} label="Leads and applications, last 7 days" href="/leads" />
            <Stat value={result.data.unread} label="Unread emails in the inbox" href="/inbox?view=unread" />
          </section>

          <section aria-labelledby="latest" className="mt-8 max-w-5xl">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="latest" className="text-lg font-semibold">Newest leads</h2>
              <Link href="/leads" className="text-sm font-semibold text-signal hover:underline">See all leads</Link>
            </div>
            {result.data.latest.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-6 text-muted">No leads yet.</p>
            ) : (
              <LeadList leads={result.data.latest} />
            )}
          </section>
        </>
      )}
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
