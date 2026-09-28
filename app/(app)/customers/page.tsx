import type { Metadata } from "next";
import Link from "next/link";
import CustomerRows from "@/components/customers/CustomerRows";
import SyncBar from "@/components/leads/SyncBar";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { listCustomers } from "@/lib/crm/queries";
import { dbState } from "@/lib/db";
import { FINANCING, listReps, listSources, STATUSES } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { syncInfo } from "@/lib/leads/source";
import { dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type Params = Record<string, string | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const search = (params.q ?? "").slice(0, 80).trim();
  const state = await dbState();
  const dbReady = state === "ready";
  const PER_PAGE = 50;
  const pageIndex = Math.max(0, Number(params.p ?? 0) || 0);

  const [list, reps, sources, sync] = dbReady
    ? await Promise.all([
        listCustomers({ search, rep: params.rep, status: params.status, fin: params.fin, scope: params.scope }, pageIndex, PER_PAGE),
        listReps(), listSources(), syncInfo(),
      ])
    : [{ customers: [], total: 0 }, [], [], null];
  const customers = list.customers;
  const pages = Math.max(1, Math.ceil(list.total / PER_PAGE));

  const keep = (extra: Params): Params => {
    const next: Params = { q: search || undefined, rep: params.rep, status: params.status, fin: params.fin, scope: params.scope, ...extra };
    return Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Params;
  };
  const filtered = Boolean(params.rep || params.status || params.fin || params.scope);
  const dbMessage = "The database isn't answering right now. Try again in a minute.";

  return (
    <>
      <PageHeader title="Customers" description="Everyone who sent a lead or credit application, one row per person. Click a row to see and change their details." />

      <form action="/customers" className="mb-3 flex flex-wrap items-end gap-2">
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
        {(filtered || search) && <Link href="/customers" className="h-10 px-2 text-sm leading-10 font-semibold text-muted hover:text-ink">Clear</Link>}
      </form>

      {sync && <SyncBar {...sync} />}
      {dbReady && (
        <p className="mb-3 text-sm text-muted">
          {list.total > PER_PAGE
            ? `Showing ${(pageIndex * PER_PAGE + 1).toLocaleString()}–${Math.min(list.total, (pageIndex + 1) * PER_PAGE).toLocaleString()} of ${list.total.toLocaleString()} customers.`
            : `${list.total} customer${list.total === 1 ? "" : "s"}.`}
        </p>
      )}

      {!dbReady ? (
        <DbNotice state={state} what="Customers" />
      ) : customers.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          {search || filtered ? "No customers match these filters." : "No customers yet. They'll appear as leads come in."}
        </p>
      ) : (
        <>
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
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold">
            {pageIndex > 0 && (
              <Link href={{ pathname: "/customers", query: keep({ p: pageIndex - 1 ? String(pageIndex - 1) : undefined }) }} className="rounded-md px-3 py-2 ring-1 ring-line hover:bg-white">Newer</Link>
            )}
            <span className="text-muted">Page {pageIndex + 1} of {pages}</span>
            {pageIndex < pages - 1 && (
              <Link href={{ pathname: "/customers", query: keep({ p: String(pageIndex + 1) }) }} className="rounded-md px-3 py-2 ring-1 ring-line hover:bg-white">Older</Link>
            )}
          </nav>
        )}
        </>
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
