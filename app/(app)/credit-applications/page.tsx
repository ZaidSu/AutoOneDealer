import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import LeadList from "@/components/leads/LeadList";
import PageHeader from "@/components/ui/PageHeader";
import SyncBar from "@/components/leads/SyncBar";
import { loadLeadPage } from "@/lib/leads/source";

export const metadata: Metadata = { title: "Credit Applications" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CreditApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = params.page && /^[\w-]{1,200}$/.test(params.page) ? params.page : undefined;
  const pageNumber = Math.max(0, Number(params.p ?? 0) || 0);
  const result = await loadLeadPage({ filter: "application", search: "", page: pageNumber, gmailToken: page });
  const nextLink = result.status !== "ok" ? null
    : result.mode === "db" ? (result.data.more ? { p: String(pageNumber + 1) } : null)
    : ("next" in result.data && result.data.next ? { page: result.data.next } : null);

  return (
    <>
      <PageHeader
        title="Credit Applications"
        description="Every email with “Loan App” in the subject. A received application isn't an approval; the full application stays with the site it came from."
      />
      {result.status === "ok" && result.sync && <SyncBar {...result.sync} />}
      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : result.data.leads.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          No credit applications yet. New ones will show up here as soon as they reach the inbox.
        </p>
      ) : (
        <>
          {(page || pageNumber > 0) && <Link href="/credit-applications" className="mb-3 inline-block text-sm font-semibold text-signal hover:underline">Back to newest</Link>}
          <LeadList leads={result.data.leads} />
          {nextLink && (
            <Link href={{ pathname: "/credit-applications", query: nextLink }} className="mt-4 inline-flex h-10 items-center rounded-md px-4 font-semibold ring-1 ring-line hover:bg-white">
              Show older
            </Link>
          )}
        </>
      )}
    </>
  );
}
