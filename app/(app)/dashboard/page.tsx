import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { getStaffSession } from "@/lib/auth/session";
import { greeting } from "@/lib/dealership";
import { displayName, formatDateTime, formatPhone, isSameDealershipDay } from "@/lib/format";
import { creditApplications, websiteLeads, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const staff = (await getStaffSession())!;
  const firstName = staff.name.split(" ")[0];

  const result = await withGmail(async (gmail) => {
    const [apps, inquiries, unread] = await Promise.all([
      creditApplications(gmail, "newer_than:7d", 50),
      websiteLeads(gmail, "newer_than:7d", 50),
      gmail.inboxUnread(),
    ]);
    const latest = [
      ...apps.map((a) => ({ id: a.messageId, kind: "application" as const, name: a.name, phone: a.phone, at: a.receivedAt })),
      ...inquiries.map((l) => ({ id: l.messageId, kind: "inquiry" as const, name: l.name, phone: l.phone, at: l.receivedAt })),
    ].sort((a, b) => b.at - a.at);
    return {
      appsToday: apps.filter((a) => isSameDealershipDay(a.receivedAt)).length,
      appsWeek: apps.length,
      inquiriesWeek: inquiries.length,
      unread,
      latest: latest.slice(0, 6),
    };
  });

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description="Here's what needs attention at the dealership." />

      {result.status !== "ok" ? (
        <GmailState status={result.status} />
      ) : (
        <>
          <section aria-label="This week" className="grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
            <Stat value={result.data.appsToday} label="Credit applications today" href="/credit-applications" highlight={result.data.appsToday > 0} />
            <Stat value={result.data.appsWeek} label="Credit applications, last 7 days" href="/credit-applications" />
            <Stat value={result.data.inquiriesWeek} label="Website inquiries, last 7 days" href="/leads" />
            <Stat value={result.data.unread} label="Unread emails in the inbox" href="/inbox?view=unread" />
          </section>

          <section aria-labelledby="latest" className="mt-8 max-w-4xl">
            <div className="flex items-baseline justify-between">
              <h2 id="latest" className="text-lg font-semibold">Newest leads</h2>
              <Link href="/leads" className="text-sm font-semibold text-signal hover:underline">See all leads</Link>
            </div>
            {result.data.latest.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-muted">No new leads in the last 7 days.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                {result.data.latest.map((lead) => (
                  <li key={lead.id}>
                    <Link href={`/inbox/${lead.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-paper">
                      <span className="font-semibold">{displayName(lead.name)}</span>
                      <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application" : "Website inquiry"}</Badge>
                      <span className="text-muted">{formatPhone(lead.phone)}</span>
                      <span className="ml-auto text-sm text-muted">{formatDateTime(lead.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
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
      <p className={`text-3xl font-semibold tabular-nums ${highlight ? "text-signal" : ""}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </Link>
  );
}
