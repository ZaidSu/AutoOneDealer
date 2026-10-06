"use client";
// Top of the customer profile: name, contact buttons, labels and everything staff can change.
import { useState } from "react";
import Chip from "@/components/ui/Chip";
import type { CustomerView } from "@/lib/customers/view";
import { displayName, formatDateTime, formatPhone } from "@/lib/utils/format";
import CustomerEditor from "./CustomerEditor";
import RemoveCustomerButton from "./RemoveCustomerButton";

type Option = { value: string; label: string };
type Props = { customer: CustomerView; reps: { id: number; name: string }[]; sources: string[]; statuses: readonly Option[]; financing: readonly Option[]; today: string };

export default function CustomerProfile({ customer, ...rest }: Props) {
  const [view, setView] = useState(customer);
  const status = rest.statuses.find((s) => s.value === view.status)?.label;
  return (
    <>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{displayName(view.name)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone={view.status}>{status}</Chip>
            {view.repName ? <Chip tone="rep">{view.repName}</Chip> : <Chip tone="neutral">Unassigned</Chip>}
            {view.financing && <Chip tone={view.financing}>{view.financing === "needs_review" ? "Loan app: needs review" : `Financing ${view.financing}`}</Chip>}
            {view.returning && <Chip tone="returning">Returning</Chip>}
            {view.scope === "out" && <Chip tone="out">Out of state{view.stateCode ? `, ${view.stateCode}` : ""}</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {view.phone && <a href={`tel:${view.phone}`} className="btn btn-primary">Call {formatPhone(view.phone)}</a>}
          {view.phone && <a href={`sms:${view.phone}`} className="btn">Text</a>}
          {view.email && <a href={`mailto:${view.email}`} className="btn">Email</a>}
        </div>
      </header>

      <dl className="facts mt-5">
        <div><dt>Email</dt><dd className="break-all">{view.email ?? "Not provided"}</dd></div>
        <div><dt>Location</dt><dd>{view.location ?? "Not provided"}</dd></div>
        <div><dt>Interested in</dt><dd>{view.vehicles.join(", ") || "No vehicle mentioned"}</dd></div>
        <div><dt>Came from</dt><dd>{view.providers.join(", ") || view.heardFrom || "Not known"}</dd></div>
        <div><dt>First contact</dt><dd>{view.firstSeen ? formatDateTime(view.firstSeen) : "Not known"}</dd></div>
        <div><dt>Lead emails</dt><dd>{view.leadsCount}</dd></div>
      </dl>

      <section aria-label="Details you can change" className="card mt-5 p-5">
        <CustomerEditor view={view} setView={setView} {...rest} />
        <div className="mt-5 border-t border-line pt-4">
          <RemoveCustomerButton customerKey={view.key} name={view.name} purchased={view.status === "purchased"} />
        </div>
      </section>
    </>
  );
}
