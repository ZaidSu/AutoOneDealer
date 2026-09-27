"use client";
// One follow-up on the Dashboard: who, why, a tap-to-call number, and quick "done" buttons.
import Link from "next/link";
import { useState, useTransition } from "react";
import { followUpAction } from "@/app/actions";
import StatusButtons from "@/components/appointments/StatusButtons";
import type { FollowUp } from "@/lib/db/data";
import { displayName, formatPhone } from "@/lib/format";

export default function FollowUpItem({ item, when }: { item: FollowUp; when: string }) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (hidden) return null;

  function act(kind: "contacted" | "tomorrow" | "no_show_done") {
    setHidden(true);
    start(async () => {
      const r = await followUpAction(kind, { key: item.key, name: item.name, appointmentId: item.appointmentId });
      if (!r.ok) { setHidden(false); setError(r.error); }
    });
  }

  const button = "h-8 rounded-md px-2.5 text-sm font-medium ring-1 ring-line hover:bg-paper disabled:opacity-60";
  return (
    <li className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          {item.key ? (
            <Link href={`/customers/${item.key}`} className="font-semibold hover:text-signal hover:underline">{displayName(item.name)}</Link>
          ) : <span className="font-semibold">{displayName(item.name)}</span>}
          {item.phone && <a href={`tel:${item.phone}`} className="text-[15px] hover:text-signal hover:underline">{formatPhone(item.phone)}</a>}
        </p>
        <p className="truncate text-sm text-muted">
          {[when, item.vehicle, item.detail, item.repName ?? "No salesperson"].filter(Boolean).join(" · ")}
        </p>
        {error && <p role="alert" className="text-sm text-signal">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.phone && (
          <a href={`tel:${item.phone}`} className="inline-flex h-8 items-center rounded-md bg-graphite px-3 text-sm font-semibold text-white hover:bg-graphite-3">Call</a>
        )}
        {item.kind === "unmarked" && item.appointmentId && <StatusButtons id={item.appointmentId} status="scheduled" />}
        {item.kind === "no_show" && <button type="button" disabled={pending} onClick={() => act("no_show_done")} className={button}>Called, done</button>}
        {(item.kind === "new_lead" || item.kind === "reminder") && (
          <button type="button" disabled={pending} onClick={() => act("contacted")} className={button}>{item.kind === "new_lead" ? "Contacted" : "Done"}</button>
        )}
        {item.kind === "loan_app" && item.key && (
          <Link href={`/customers?q=${encodeURIComponent(item.phone ?? item.name)}`} className={`${button} inline-flex items-center`}>Review</Link>
        )}
        {item.key && item.kind !== "unmarked" && (
          <button type="button" disabled={pending} onClick={() => act("tomorrow")} className={button}>Tomorrow</button>
        )}
      </div>
    </li>
  );
}
