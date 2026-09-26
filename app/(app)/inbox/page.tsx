import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";
import { mapLimit, withGmail } from "@/lib/gmail";
import { leadKind, providerFor } from "@/lib/parsers/leads";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const VIEWS = {
  all: { label: "All email", query: "in:inbox" },
  leads: { label: "Leads only", query: 'in:inbox (subject:lead OR subject:"loan app")' },
  unread: { label: "Unread", query: "in:inbox is:unread" },
} as const;
type View = keyof typeof VIEWS;

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const view: View = params.view && params.view in VIEWS ? (params.view as View) : "all";
  const search = (params.q ?? "").slice(0, 100).trim();
  const query = [VIEWS[view].query, search].filter(Boolean).join(" ");

  const result = await withGmail(async (gmail) => {
    const ids = await gmail.listIds(query, 30);
    return mapLimit(ids, 10, (id) => gmail.summary(id));
  });

  return (
    <>
      <PageHeader title="Inbox" description="The dealership's Gmail inbox. Read-only for now; replying from AutoDash comes later." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Inbox views" className="flex rounded-md bg-white p-1 ring-1 ring-line">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <Link
              key={key}
              href={{ pathname: "/inbox", query: { view: key, ...(search ? { q: search } : {}) } }}
              aria-current={view === key ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm font-medium ${view === key ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}
            >
              {VIEWS[key].label}
            </Link>
          ))}
        </nav>
        <form action="/inbox" className="flex min-w-0 flex-1 gap-2 sm:max-w-sm">
          <input type="hidden" name="view" value={view} />
          <label htmlFor="inbox-search" className="sr-only">Search email</label>
          <input
            id="inbox-search"
            name="q"
            defaultValue={search}
            placeholder="Search by name, phone or words"
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[15px] placeholder:text-muted/70"
          />
          <button className="h-10 rounded-md px-4 font-semibold ring-1 ring-line hover:bg-white">Search</button>
        </form>
      </div>

      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : result.data.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          {search ? `Nothing matches “${search}”.` : "No email here."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {result.data.map((m) => {
            const kind = leadKind(m.subject);
            return (
              <li key={m.id}>
                <Link href={`/inbox/${m.id}`} className="grid gap-x-4 px-4 py-3.5 hover:bg-paper sm:grid-cols-[220px_minmax(0,1fr)_auto]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className={`size-2 shrink-0 rounded-full ${m.unread ? "bg-signal" : "bg-transparent"}`} />
                    <span className={`truncate ${m.unread ? "font-semibold" : ""}`}>{m.fromName}</span>
                    {m.unread && <span className="sr-only">(unread)</span>}
                  </div>
                  <div className="min-w-0 pl-4 sm:pl-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {kind === "application" && <Badge tone="application">Credit app</Badge>}
                      {kind === "inquiry" && <Badge tone="inquiry">{providerFor(m.from, m.subject)} lead</Badge>}
                      <span className={`truncate ${m.unread ? "font-semibold" : ""}`}>{m.subject}</span>
                    </div>
                    <p className="truncate text-sm text-muted">{m.snippet}</p>
                  </div>
                  <span className="pl-4 text-sm whitespace-nowrap text-muted sm:pl-0">{formatDateTime(m.receivedAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
