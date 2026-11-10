import type { Metadata } from "next";
import Link from "next/link";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { listContacts, type ContactFilter } from "@/lib/contacts/rows";

export const metadata: Metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "");
const ago = (ms: number | null) => { if (!ms) return ""; const d = Math.floor((Date.now() - ms) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const pretty = (p: string | null) => (p ? p.replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") : "");
const FILTERS: [ContactFilter, string][] = [["all", "Everyone"], ["waiting", "Waiting on a rep"], ["active", "Still shopping"], ["purchased", "Purchased"]];

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageStaff();
  const params = await searchParams;
  const filter = (FILTERS.find(([f]) => f === params.show)?.[0] ?? "all") as ContactFilter;
  const q = (params.q ?? "").slice(0, 60);
  const header = <PageHeader title="Contacts" description="Everyone who has reached out, one person per row. Green means they purchased. Red means they are waiting on a sales rep." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Contacts" /></>;
  const { rows, counts } = await fresh("Contacts", () => listContacts({ q, filter }));
  const link = (show: string) => ({ pathname: "/contacts", query: { ...(show !== "all" ? { show } : {}), ...(q ? { q } : {}) } });

  return (
    <div className="max-w-6xl">
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="segmented">
          {FILTERS.map(([f, label]) => (
            <Link key={f} href={link(f)} aria-current={filter === f ? "page" : undefined}>
              {label}{f === "waiting" && counts.waiting > 0 && <span className="ml-1.5 rounded-full bg-signal px-1.5 py-0.5 text-xs font-bold text-white">{counts.waiting}</span>}
            </Link>
          ))}
        </div>
        <form className="ml-auto flex gap-2" action="/contacts">
          {filter !== "all" && <input type="hidden" name="show" value={filter} />}
          <input className="input mt-0 h-10 w-64" name="q" defaultValue={q} placeholder="Search name, phone or car" aria-label="Search contacts" />
          <button className="btn btn-primary h-10">Search</button>
        </form>
      </div>

      {rows.length === 0 ? <p className="panel p-6 text-muted">{q ? "No contacts match that search." : "No contacts here yet."}</p> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted">
              <tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Interested in</th><th className="px-4 py-3 font-semibold">Phone</th><th className="px-4 py-3 font-semibold">Reached out</th><th className="px-4 py-3 font-semibold" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.key} className={c.waitingOnRep ? "bg-signal-soft" : c.purchased ? "bg-go-soft" : ""}>
                  <td className="relative px-4 py-3">
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.waitingOnRep ? "#d7163b" : c.purchased ? "#12a150" : "transparent" }} />
                    <Link href={`/customers/${encodeURIComponent(c.key)}`} className="font-bold hover:underline">{c.name || pretty(c.phone) || "No name"}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.car || "Not mentioned"}</td>
                  <td className="px-4 py-3 tabular-nums">{c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{pretty(c.phone)}</a> : <span className="text-faint">none</span>}</td>
                  <td className="px-4 py-3 text-muted"><span className="block text-ink">{when(c.reachedAt)}</span><span className="text-sm">{ago(c.reachedAt)}</span></td>
                  <td className="px-4 py-3 text-right">
                    {c.waitingOnRep && <span className="rounded-full bg-signal px-2.5 py-1 text-xs font-bold text-white">Waiting on a sales rep</span>}
                    {c.purchased && <span className="rounded-full bg-go px-2.5 py-1 text-xs font-bold text-white">Purchased</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-faint">Showing the {rows.length} most recent. Search to find anyone older.</p>
    </div>
  );
}
