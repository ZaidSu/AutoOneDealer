import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ActivityLog from "@/components/customers/ActivityLog";
import CustomerEmails from "@/components/customers/CustomerEmails";
import CustomerProfile from "@/components/customers/CustomerProfile";
import Badge from "@/components/leads/Badge";
import DbNotice from "@/components/ui/DbNotice";
import { parseCustomerKey } from "@/lib/customers";
import { ACTIVITY_KINDS, activitiesFor, getCustomer } from "@/lib/crm/queries";
import { dbState } from "@/lib/db";
import { appointmentsForCustomer, FINANCING, listReps, listSources, STATUSES } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { formatDateTime, formatMoney } from "@/lib/format";
import { leadsForCustomer } from "@/lib/leads/store";
import { dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type Entry = { at: number; key: string; node: React.ReactNode };

export default async function CustomerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!parseCustomerKey(key)) notFound();
  const state = await dbState();
  if (state !== "ready") return <DbNotice state={state} what="Customer profiles" />;

  const [customer, leads, activities, appointments, reps, sources] = await Promise.all([
    getCustomer(key), leadsForCustomer(key), activitiesFor(key), appointmentsForCustomer(key), listReps(), listSources(),
  ]);
  if (!customer) notFound();

  // One timeline: lead emails, appointments and everything staff logged, newest first.
  const entries: Entry[] = [
    ...leads.map((lead) => ({
      at: lead.receivedAt, key: `l-${lead.messageId}`,
      node: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application" : lead.type}</Badge>
            <span className="text-sm text-muted">from {lead.provider}</span>
            <Link href={`/inbox/${lead.messageId}`} className="ml-auto text-sm font-semibold text-signal hover:underline">Open email</Link>
          </div>
          <p className="mt-1.5">
            {lead.kind === "application"
              ? [lead.loanAmount !== null && `Loan amount ${formatMoney(lead.loanAmount)}`, lead.downPayment !== null && `down payment ${formatMoney(lead.downPayment)}`].filter(Boolean).join(", ") || "Application details are in the original email."
              : lead.vehicle ?? "No vehicle mentioned"}
          </p>
          {lead.comments && lead.kind !== "application" && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{lead.comments}</p>}
        </>
      ),
    })),
    ...appointments.map((a) => ({
      at: a.startsAt.getTime(), key: `a-${a.id}`,
      node: (
        <p>
          <span className="font-semibold">Appointment{a.status === "scheduled" ? "" : a.status === "showed" ? ": showed up" : a.status === "no_show" ? ": no-show" : ": canceled"}</span>
          <span className="text-muted">{a.repName ? ` with ${a.repName}` : ""}{a.vehicle ? `, ${a.vehicle}` : ""}</span>
        </p>
      ),
    })),
    ...activities.map((act) => ({
      at: act.at, key: `x-${act.id}`,
      node: (
        <p>
          <span className="font-semibold">{ACTIVITY_KINDS[act.kind] ?? act.kind}</span>
          {act.body && <span className={act.kind === "note" || act.kind === "call" ? " whitespace-pre-line" : " text-muted"}>{act.kind === "note" ? ": " : act.body ? ". " : ""}{act.body}</span>}
          {act.staff && <span className="text-sm text-muted"> ({act.staff})</span>}
        </p>
      ),
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <article className="max-w-5xl">
      <Link href="/customers" className="text-sm font-semibold text-muted hover:text-ink">All customers</Link>
      <CustomerProfile
        customer={customer}
        reps={reps.map((r) => ({ id: r.id, name: r.name }))}
        sources={sources.map((s) => s.name)}
        statuses={STATUSES}
        financing={FINANCING}
        today={dayKey(Date.now(), dealership.timeZone)}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="timeline">
          <h2 id="timeline" className="section-title">History</h2>
          <ActivityLog customerKey={customer.key} />
          <ol className="timeline mt-4">
            {entries.map((e) => (
              <li key={e.key}>
                <time className="text-sm text-muted tabular-nums">{formatDateTime(e.at)}</time>
                <div className="mt-0.5">{e.node}</div>
              </li>
            ))}
            {entries.length === 0 && <li className="text-muted">Nothing yet.</li>}
          </ol>
        </section>
        <aside aria-labelledby="emails">
          <h2 id="emails" className="section-title">Emails with this customer</h2>
          <CustomerEmails customerKey={customer.key} hasEmail={Boolean(customer.email)} />
        </aside>
      </div>
    </article>
  );
}
