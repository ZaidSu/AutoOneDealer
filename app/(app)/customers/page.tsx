import type { Metadata } from "next";
import Link from "next/link";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { groupCustomers } from "@/lib/customers";
import { displayName, formatDateTime, formatPhone } from "@/lib/format";
import { fetchManyLeads, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RANGES = { recent: { label: "Last 150 leads", limit: 150 }, more: { label: "Last 400 leads", limit: 400 } } as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const range = params.range === "more" ? "more" : "recent";
  const search = (params.q ?? "").slice(0, 80).trim();

  const result = await withGmail((gmail) => fetchManyLeads(gmail, { limit: RANGES[range].limit }));
  const all = result.status === "ok" ? groupCustomers(result.data.leads) : [];
  const needle = search.toLowerCase();
  const needleDigits = search.replace(/\D/g, "");
  const customers = search
    ? all.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(needle) ||
          c.emails.some((e) => e.includes(needle)) ||
          c.vehicles.some((v) => v.toLowerCase().includes(needle)) ||
          (needleDigits.length >= 3 && c.phones.some((p) => p.includes(needleDigits))),
      )
    : all;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has sent a lead or credit application, grouped by phone number or email so each person appears once."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/customers" className="flex min-w-0 flex-1 gap-2 sm:max-w-sm">
          <input type="hidden" name="range" value={range} />
          <label htmlFor="customer-search" className="sr-only">Search customers</label>
          <input id="customer-search" name="q" defaultValue={search} placeholder="Name, phone, email or car"
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[15px] placeholder:text-muted/70" />
          <button className="h-10 rounded-md px-4 font-semibold ring-1 ring-line hover:bg-white">Search</button>
        </form>
        {result.status === "ok" && (
          <p className="text-sm text-muted">
            {customers.length} customer{customers.length === 1 ? "" : "s"} from the {RANGES[range].label.toLowerCase()}.{" "}
            {result.data.skipped > 0 && <span>{result.data.skipped} email{result.data.skipped === 1 ? "" : "s"} couldn't be read this time and will be retried. </span>}
            {range === "recent" && result.data.more && (
              <Link href={{ pathname: "/customers", query: { range: "more", ...(search ? { q: search } : {}) } }} className="font-semibold text-signal hover:underline">
                Look further back
              </Link>
            )}
          </p>
        )}
      </div>

      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : customers.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          {search ? `No customers match “${search}”.` : "No customers yet. They'll appear as leads come in."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {customers.map((c) => (
            <li key={c.key}>
              <Link href={`/customers/${c.key}`} className="grid gap-x-6 gap-y-1.5 px-4 py-4 hover:bg-paper md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{displayName(c.name)}</span>
                    {c.hasApplication && <Badge tone="application">Credit app</Badge>}
                    {c.leads.length > 1 && <Badge tone="inquiry">{c.leads.length} inquiries</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {[c.vehicles.slice(0, 2).join(", "), c.location].filter(Boolean).join(" · ") || "No vehicle mentioned"}
                  </p>
                </div>
                <div className="min-w-0 text-[15px]">
                  {c.phones[0] && <span className="block">{formatPhone(c.phones[0])}</span>}
                  {c.emails[0] && <span className="block truncate text-sm text-muted">{c.emails[0]}</span>}
                </div>
                <div className="text-sm md:text-right">
                  <span className="block whitespace-nowrap text-muted">Last contact {formatDateTime(c.lastSeen)}</span>
                  <span className="block text-muted">{c.sources.join(", ")}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
