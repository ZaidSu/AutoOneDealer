import { requirePageStaff } from "@/lib/auth/guard";
import type { Metadata } from "next";
import Link from "next/link";
import Badge from "@/components/leads/Badge";
import SyncBar from "@/components/leads/SyncBar";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { dbState } from "@/lib/db";
import { displayName, formatDateTime } from "@/lib/utils/format";
import { syncInfo } from "@/lib/leads/source";
import { queryLeads } from "@/lib/leads/store";
import { attempt } from "@/lib/utils/safe";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const VIEWS = { all: "All lead emails", inquiry: "Leads", application: "Credit applications" } as const;
type View = keyof typeof VIEWS;
const PER_PAGE = 50;

// Only lead emails, read from the saved copies (no Gmail request). Opening one fetches the full email.
export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageStaff();
  const params = await searchParams;
  const view: View = params.view && params.view in VIEWS ? (params.view as View) : "all";
  const search = (params.q ?? "").slice(0, 80).trim();
  const page = Math.max(0, Number(params.p ?? 0) || 0);
  const state = await dbState();
  const header = <PageHeader title="Inbox" description="Lead and credit application emails only. Everything else in the mailbox stays in Gmail." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="The inbox" /></>;

  const [list, sync] = await Promise.all([
    attempt("Lead emails", () => queryLeads({ filter: view === "all" ? undefined : view, search, limit: PER_PAGE, offset: page * PER_PAGE }), { leads: [], more: false }),
    syncInfo().catch(() => null),
  ]);
  const { leads, more } = list.data;
  const href = (extra: Record<string, string | number | undefined>) => ({
    pathname: "/inbox",
    query: Object.fromEntries(Object.entries({ view: view === "all" ? undefined : view, q: search || undefined, ...extra }).filter(([, v]) => v !== undefined && String(v) !== "0")),
  });

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Show" className="segmented">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link key={v} href={{ pathname: "/inbox", query: { ...(v === "all" ? {} : { view: v }), ...(search ? { q: search } : {}) } }} aria-current={view === v ? "page" : undefined}>{VIEWS[v]}</Link>
          ))}
        </nav>
        <form action="/inbox" className="flex gap-2">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={search} placeholder="Name, phone, email or car" aria-label="Search lead emails"
            className="h-10 w-64 rounded-md border border-line bg-white px-3 text-[15px]" />
          <button className="btn">Search</button>
        </form>
      </div>
      {sync && <SyncBar {...sync} />}
      {list.error && <p role="alert" className="mb-4 rounded-md border border-signal/30 bg-warn-soft px-4 py-3 text-sm">Couldn&apos;t load lead emails. {list.error}</p>}

      {leads.length === 0 && !list.error ? (
        <p className="card p-6 text-muted">{search ? `No lead emails match “${search}”.` : "No lead emails saved yet. They appear here within a minute of arriving in Gmail."}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {leads.map((lead) => (
            <li key={lead.messageId}>
              <Link href={`/inbox/${lead.messageId}`} className="grid gap-1 px-4 py-3 hover:bg-paper sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{displayName(lead.name)}</span>
                    <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application" : lead.type}</Badge>
                    <span className="text-sm text-muted">{lead.provider}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">{lead.subject}</span>
                </span>
                <time className="text-sm whitespace-nowrap text-muted tabular-nums">{formatDateTime(lead.receivedAt)}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(page > 0 || more) && (
        <nav aria-label="Pages" className="mt-4 flex gap-3">
          {page > 0 && <Link href={href({ p: page - 1 })} className="btn">Newer</Link>}
          {more && <Link href={href({ p: page + 1 })} className="btn">Older</Link>}
        </nav>
      )}
    </>
  );
}
