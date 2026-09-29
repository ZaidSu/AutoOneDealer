import { requirePageStaff } from "@/lib/auth/guard";
import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import LeadList from "@/components/leads/LeadList";
import PageHeader from "@/components/ui/PageHeader";
import type { LeadFilter } from "@/lib/gmail";
import SyncBar from "@/components/leads/SyncBar";
import { loadLeadPage } from "@/lib/leads/source";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const FILTERS: { key: LeadFilter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "inquiry", label: "Leads" },
  { key: "application", label: "Credit applications" },
];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageStaff();
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.show)?.key ?? "all") as LeadFilter;
  const search = (params.q ?? "").slice(0, 80).trim();
  const page = params.page && /^[\w-]{1,200}$/.test(params.page) ? params.page : undefined;
  const pageNumber = Math.max(0, Number(params.p ?? 0) || 0);

  const result = await loadLeadPage({ filter, search, page: pageNumber, gmailToken: page });
  const nextLink = result.status !== "ok" ? null
    : result.mode === "db" ? (result.data.more ? { p: String(pageNumber + 1) } : null)
    : ("next" in result.data && result.data.next ? { page: result.data.next } : null);
  const keep: Record<string, string> = { show: filter, ...(search ? { q: search } : {}) };

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every email with “Lead” or “Loan App” in the subject: Cars.com, CarsForSale, Edmunds, CarGurus and anyone else."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Lead types" className="flex rounded-md bg-white p-1 ring-1 ring-line">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={{ pathname: "/leads", query: { show: f.key, ...(search ? { q: search } : {}) } }}
              aria-current={filter === f.key ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm font-medium ${filter === f.key ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form action="/leads" className="flex min-w-0 flex-1 gap-2 sm:max-w-sm">
          <input type="hidden" name="show" value={filter} />
          <label htmlFor="lead-search" className="sr-only">Search leads</label>
          <input id="lead-search" name="q" defaultValue={search} placeholder="Name, phone, car or site"
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[15px] placeholder:text-muted/70" />
          <button className="h-10 rounded-md px-4 font-semibold ring-1 ring-line hover:bg-white">Search</button>
        </form>
      </div>

      {result.status === "ok" && result.sync && <SyncBar {...result.sync} />}
      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : result.data.leads.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          {search ? `No leads match “${search}”.` : "No leads found yet. New lead emails will appear here automatically."}
        </p>
      ) : (
        <>
          {(page || pageNumber > 0) && (
            <Link href={{ pathname: "/leads", query: keep }} className="mb-3 inline-block text-sm font-semibold text-signal hover:underline">
              Back to newest
            </Link>
          )}
          <LeadList leads={result.data.leads} />
          {nextLink && (
            <Link href={{ pathname: "/leads", query: { ...keep, ...nextLink } }} className="mt-4 inline-flex h-10 items-center rounded-md px-4 font-semibold ring-1 ring-line hover:bg-white">
              Show older
            </Link>
          )}
          <p className="mt-4 text-sm text-muted">Salesperson, status and notes are set on the Customers page.</p>
        </>
      )}
    </>
  );
}
