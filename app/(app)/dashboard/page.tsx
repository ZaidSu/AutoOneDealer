import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import LeadList from "@/components/leads/LeadList";
import PageHeader from "@/components/ui/PageHeader";
import { getStaffSession } from "@/lib/auth/session";
import { dealership, greeting } from "@/lib/dealership";
import { fetchLeads, LEAD_QUERIES, startOfDealershipDay, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const staff = (await getStaffSession())!;
  const firstName = staff.name.split(" ")[0];

  const result = await withGmail(async (gmail) => {
    const today = `after:${startOfDealershipDay(dealership.timeZone)}`;
    // Counts only list message IDs, so they stay fast even on busy days.
    const [leadsToday, appsToday, leadsWeek, unread, latest] = await Promise.all([
      gmail.count(`${LEAD_QUERIES.inquiry} ${today}`),
      gmail.count(`${LEAD_QUERIES.application} ${today}`),
      gmail.count(`${LEAD_QUERIES.all} newer_than:7d`),
      gmail.inboxUnread(),
      fetchLeads(gmail, { max: 6 }),
    ]);
    return { leadsToday, appsToday, leadsWeek, unread, latest: latest.leads };
  });

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description="Here's what needs attention at the dealership." />

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
