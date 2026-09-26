import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import LeadList from "@/components/leads/LeadList";
import LoadMore from "@/components/leads/LoadMore";
import PageHeader from "@/components/ui/PageHeader";
import { fetchLeads, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Credit Applications" };
export const dynamic = "force-dynamic";

export default async function CreditApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = params.page && /^[\w-]{1,200}$/.test(params.page) ? params.page : undefined;
  const result = await withGmail((gmail) => fetchLeads(gmail, { filter: "application", pageToken: page }));

  return (
    <>
      <PageHeader
        title="Credit Applications"
        description="Every email with “Loan App” in the subject. A received application isn't an approval; the full application stays with the site it came from."
      />
      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : result.data.leads.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          No credit applications yet. New ones will show up here as soon as they reach the inbox.
        </p>
      ) : (
        <>
          {page && <Link href="/credit-applications" className="mb-3 inline-block text-sm font-semibold text-signal hover:underline">Back to newest</Link>}
          <LeadList leads={result.data.leads} />
          <LoadMore basePath="/credit-applications" params={{}} next={result.data.next} />
        </>
      )}
    </>
  );
}
