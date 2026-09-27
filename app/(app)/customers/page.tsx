import type { Metadata } from "next";
import Link from "next/link";
import CustomerRows from "@/components/customers/CustomerRows";
import GmailState from "@/components/gmail/GmailState";
import PageHeader from "@/components/ui/PageHeader";
import { buildCustomerViews } from "@/lib/customer-view";
import { groupCustomers } from "@/lib/customers";
import { dbState } from "@/lib/db";
import { appointmentsForCustomers, customerRecords, FINANCING, listReps, listSources, STATUSES } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { fetchManyLeads, withGmail } from "@/lib/gmail";
import { dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RANGES = { recent: { label: "last 150 leads", limit: 150 }, more: { label: "last 400 leads", limit: 400 } } as const;
type Params = Record<string, string | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const range = params.range === "more" ? "more" : "recent";
  const search = (params.q ?? "").slice(0, 80).trim();
  const state = await dbState();
  const dbReady = state === "ready";

  const [result, reps, sources] = await Promise.all([
    withGmail((gmail) => fetchManyLeads(gmail, { limit: RANGES[range].limit })),
    dbReady ? listReps() : Promise.resolve([]),
    dbReady ? listSources() : Promise.resolve([]),
  ]);

  const grouped = result.status === "ok" ? groupCustomers(result.data.leads) : [];
  const keys = grouped.map((c) => c.key);
  const [records, appointments] = dbReady
    ? await Promise.all([customerRecords(keys), appointmentsForCustomers(keys)])
    : [new Map(), new Map()];
  const all = buildCustomerViews(grouped, records, reps, appointments);

  // Filters
  const needle = search.toLowerCase();
  const digits = search.replace(/\D/g, "");
  const customers = all.filter((c) => {
    if (search && !(
      (c.name ?? "").toLowerCase().includes(needle) ||
      (c.email ?? "").includes(needle) ||
      c.vehicles.some((v) => v.toLowerCase().includes(needle)) ||
      (c.heardFrom ?? "").toLowerCase().includes(needle) ||
      (digits.length >= 3 && (c.phone ?? "").includes(digits))
    )) return false;
    if (params.rep === "none" && c.repId !== null) return false;
    if (params.rep && params.rep !== "none" && String(c.repId) !== params.rep) return false;
    if (params.status && c.status !== params.status) return false;
    if (params.fin && c.financing !== params.fin) return false;
    if (params.scope && c.scope !== params.scope) return false;
    return true;
  });

  const keep = (extra: Params): Params => {
    const next: Params = { range, q: search || undefined, rep: params.rep, status: params.status, fin: params.fin, scope: params.scope, ...extra };
    return Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Params;
  };
  const filtered = Boolean(params.rep || params.status || params.fin || params.scope);
  const dbMessage =
    state === "not_configured" ? "Salesperson, status, financing, notes and appointments turn on when the database is connected."
    : state === "not_set_up" ? "Almost ready: open the Developer page and click Set up database."
    : "The database isn't answering right now. Try again in a minute.";

  return (
    <>
      <PageHeader title="Customers" description="Everyone who sent a lead or credit application, one row per person. Click a row to see and change their details." />

      <form action="/customers" className="mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value={range} />
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search customers</span>
          <input name="q" defaultValue={search} placeholder="Name, phone, email, car or source"
            className="h-10 w-full rounded-md border border-line bg-white px-3 text-[15px] placeholder:text-muted/70" />
        </label>
        {dbReady && (
          <>
            <Filter name="rep" label="Salesperson" value={params.rep} options={[{ value: "none", label: "Unassigned" }, ...reps.map((r) => ({ value: String(r.id), label: r.name }))]} />
            <Filter name="status" label="Status" value={params.status} options={STATUSES} />
          </>
        )}
        <Filter name="fin" label="Financing" value={params.fin} options={FINANCING} />
        <Filter name="scope" label="State" value={params.scope} options={[{ value: "in", label: "In state" }, { value: "out", label: "Out of state" }]} />
        <button className="h-10 rounded-md bg-graphite px-4 font-semibold text-white hover:bg-graphite-3">Show</button>
        {(filtered || search) && <Link href={{ pathname: "/customers", query: { range } }} className="h-10 px-2 text-sm leading-10 font-semibold text-muted hover:text-ink">Clear</Link>}
      </form>

      {result.status === "ok" && (
        <p className="mb-3 text-sm text-muted">
          {customers.length} customer{customers.length === 1 ? "" : "s"} from the {RANGES[range].label}.{" "}
          {result.data.skipped > 0 && <span>{result.data.skipped} email{result.data.skipped === 1 ? "" : "s"} couldn't be read this time and will be retried. </span>}
          {range === "recent" && result.data.more && (
            <Link href={{ pathname: "/customers", query: keep({ range: "more" }) }} className="font-semibold text-signal hover:underline">Look further back</Link>
          )}
        </p>
      )}

      {result.status !== "ok" ? (
        <GmailState {...result} />
      ) : customers.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          {search || filtered ? "No customers match these filters." : "No customers yet. They'll appear as leads come in."}
        </p>
      ) : (
        <CustomerRows
          customers={customers}
          reps={reps.map((r) => ({ id: r.id, name: r.name }))}
          sources={sources.map((s) => s.name)}
          statuses={STATUSES}
          financing={FINANCING}
          dbReady={dbReady}
          dbMessage={dbMessage}
          today={dayKey(Date.now(), dealership.timeZone)}
        />
      )}
    </>
  );
}

function Filter({ name, label, value, options }: { name: string; label: string; value?: string; options: readonly { value: string; label: string }[] }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-10 rounded-md border border-line bg-white px-2.5 text-[15px]">
        <option value="">{label}: all</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
