"use client";
import Link from "next/link";
import { useState } from "react";
import CustomerEditor from "./CustomerEditor";
import Chip from "@/components/ui/Chip";
import type { CustomerView } from "@/lib/customers/view";
import { displayName, formatDateTime, formatPhone } from "@/lib/utils/format";

type Option = { value: string; label: string };
type Props = {
  customers: CustomerView[];
  reps: { id: number; name: string }[];
  sources: string[];
  statuses: readonly Option[];
  financing: readonly Option[];
  dbReady: boolean;
  dbMessage: string;
  today: string;
};

export default function CustomerRows(props: Props) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
      {props.customers.map((c) => <Row key={c.key} customer={c} {...props} />)}
    </ul>
  );
}


function Row({ customer: c, reps, sources, statuses, financing, dbReady, dbMessage, today }: Props & { customer: CustomerView }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(c);
  const statusLabel = statuses.find((s) => s.value === view.status)?.label ?? view.status;
  const financingLabel = financing.find((f) => f.value === view.financing)?.label;

  return (
    <li>
      <div className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper/60">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close details" : "Open details"}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
          <svg viewBox="0 0 20 20" className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="grid min-w-0 flex-1 gap-x-6 gap-y-1 text-left md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-semibold">{displayName(view.name)}</span>
              {view.repName ? <Chip tone="rep">{view.repName}</Chip> : dbReady && <Chip tone="neutral">Unassigned</Chip>}
              {dbReady && view.status !== "new" && (
                <Chip tone={view.status}>
                  {view.status === "appointment" && view.nextAppointment ? `Appointment ${formatDateTime(view.nextAppointment.at)}` : statusLabel}
                </Chip>
              )}
              {view.financing && <Chip tone={view.financing}>{view.financing === "needs_review" ? "Loan app: needs review" : `Financing ${financingLabel?.toLowerCase()}`}</Chip>}
              {view.returning && <Chip tone="returning">Returning</Chip>}
              {view.followUpAt && <Chip tone="appointment">Follow up {view.followUpAt <= today ? "today" : view.followUpAt.slice(5).replace("-", "/")}</Chip>}
              {view.scope === "out" && <Chip tone="out">Out of state{view.stateCode ? ` · ${view.stateCode}` : ""}</Chip>}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">
              {[view.vehicles.slice(0, 2).join(", "), view.heardFrom].filter(Boolean).join(" · ") || "No vehicle mentioned"}
            </p>
          </div>
          <div className="min-w-0 text-[15px]">
            {view.phone && <span className="block">{formatPhone(view.phone)}</span>}
            {view.email && <span className="block truncate text-sm text-muted">{view.email}</span>}
          </div>
          <span className="whitespace-nowrap text-sm text-muted md:text-right">{formatDateTime(view.lastSeen)}</span>
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-paper/40 px-4 pt-4 pb-5 sm:pl-[60px]">
          {dbReady ? (
            <CustomerEditor view={view} setView={setView} reps={reps} sources={sources} statuses={statuses} financing={financing} today={today} />
          ) : (
            <p className="rounded-md border border-dashed border-line bg-white px-4 py-3 text-sm text-muted">{dbMessage}</p>
          )}

          <div className="mt-4 text-sm">
            <p className="font-semibold text-ink">History</p>
            <ul className="mt-1 space-y-1">
              {view.leads.map((l) => (
                <li key={l.id} className="text-muted">
                  <Link href={`/inbox/${l.id}`} className="hover:text-ink hover:underline">
                    {formatDateTime(l.at)}: {l.kind === "application" ? "Credit application" : l.type} from {l.provider}{l.vehicle ? `, ${l.vehicle}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/customers/${view.key}`} className="mt-2 inline-block font-semibold text-signal hover:underline">Full profile, history and emails</Link>
          </div>

        </div>
      )}
    </li>
  );
}

