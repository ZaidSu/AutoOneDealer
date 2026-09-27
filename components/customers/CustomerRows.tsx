"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createAppointmentAction, updateCustomerAction } from "@/app/actions";
import Chip from "@/components/ui/Chip";
import type { CustomerView } from "@/lib/customer-view";
import type { CustomerField } from "@/lib/db/data";
import { displayName, formatDateTime, formatPhone } from "@/lib/format";

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

const select = "mt-1 h-10 w-full rounded-md border border-line bg-white px-2.5 text-[15px] text-ink disabled:bg-paper";

function Row({ customer: c, reps, sources, statuses, financing, dbReady, dbMessage, today }: Props & { customer: CustomerView }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(c);
  const [saving, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const statusLabel = statuses.find((s) => s.value === view.status)?.label ?? view.status;
  const financingLabel = financing.find((f) => f.value === view.financing)?.label;

  function save(field: CustomerField, value: string, patch: Partial<CustomerView>) {
    const previous = view;
    setView({ ...view, ...patch });
    start(async () => {
      const result = await updateCustomerAction(c.key, c.name, field, value);
      if (!result.ok) { setView(previous); setMessage({ ok: false, text: result.error }); }
      else setMessage({ ok: true, text: "Saved" });
    });
  }

  const sourceOptions = Array.from(new Set([...(view.heardFrom ? [view.heardFrom] : []), ...sources]));

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
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-sm text-muted">Salesperson
                  <select className={select} value={view.repId ?? ""} disabled={saving}
                    onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; save("rep", e.target.value, { repId: id, repName: reps.find((r) => r.id === id)?.name ?? null }); }}>
                    <option value="">Unassigned</option>
                    {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <label className="text-sm text-muted">Status
                  <select className={select} value={view.status} disabled={saving}
                    onChange={(e) => save("status", e.target.value, { status: e.target.value as CustomerView["status"] })}>
                    {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                <label className="text-sm text-muted">Financing
                  <select className={select} value={view.financing ?? ""} disabled={saving}
                    onChange={(e) => save("financing", e.target.value, { financing: (e.target.value || null) as CustomerView["financing"], financingIsAuto: false })}>
                    <option value="">None</option>
                    {financing.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
                <label className="text-sm text-muted">Heard about us
                  <select className={select} value={view.heardFrom ?? ""} disabled={saving}
                    onChange={(e) => save("heard_from", e.target.value, { heardFrom: e.target.value || null, heardFromIsAuto: false })}>
                    <option value="">Not known</option>
                    {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="text-sm text-muted">In or out of state
                  <select className={select} value={view.scope ?? ""} disabled={saving}
                    onChange={(e) => save("state_scope", e.target.value, { scope: (e.target.value || null) as CustomerView["scope"], scopeIsAuto: false })}>
                    <option value="">Not known</option>
                    <option value="in">In state (Texas)</option>
                    <option value="out">Out of state</option>
                  </select>
                </label>
              </div>

              <label className="mt-4 block text-sm text-muted">Notes
                <textarea defaultValue={view.notes} rows={2} placeholder="Called, wants to trade in a 2012 Accord"
                  onBlur={(e) => e.target.value !== view.notes && save("notes", e.target.value, { notes: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink" />
              </label>

              <BookAppointment customer={view} reps={reps} today={today} />
            </>
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
            <Link href={`/customers/${view.key}`} className="mt-2 inline-block font-semibold text-signal hover:underline">Full profile and emails</Link>
          </div>

          {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-go" : "text-signal"}`}>{message.text}</p>}
        </div>
      )}
    </li>
  );
}

function BookAppointment({ customer, reps, today }: { customer: CustomerView; reps: { id: number; name: string }[]; today: string }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:00");
  const [repId, setRepId] = useState<string>(customer.repId ? String(customer.repId) : "");
  const [result, setResult] = useState<{ ok: boolean; text: string; conflict?: string } | null>(null);
  const [pending, start] = useTransition();

  function book(force = false) {
    if (!date) return setResult({ ok: false, text: "Pick a day first." });
    start(async () => {
      const r = await createAppointmentAction({
        customerKey: customer.key, customerName: displayName(customer.name), phone: customer.phone,
        vehicle: customer.vehicles[0] ?? null, repId: repId ? Number(repId) : null, date, time, force,
      });
      setResult(r.ok ? { ok: true, text: r.message ?? "Booked." } : { ok: false, text: r.error, conflict: r.conflict });
    });
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        {customer.nextAppointment ? `Next appointment: ${formatDateTime(customer.nextAppointment.at)}${customer.nextAppointment.repName ? ` with ${customer.nextAppointment.repName}` : ""}. Book another:` : "Book an appointment:"}
      </p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <label className="text-sm text-muted"><span className="sr-only">Day</span>
          <input type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setResult(null); }} className="h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
        <label className="text-sm text-muted"><span className="sr-only">Time</span>
          <input type="time" step={900} value={time} onChange={(e) => { setTime(e.target.value); setResult(null); }} className="h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
        <label className="text-sm text-muted"><span className="sr-only">With</span>
          <select value={repId} onChange={(e) => { setRepId(e.target.value); setResult(null); }} className="h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink">
            <option value="">Any salesperson</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={pending} onClick={() => book(false)}
          className="h-10 rounded-md bg-graphite px-4 font-semibold text-white hover:bg-graphite-3 disabled:opacity-60">
          {pending ? "Booking…" : "Book"}
        </button>
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mt-2 text-sm ${result.ok ? "text-go" : "text-signal"}`}>
          {result.text}{" "}
          {result.conflict && <button type="button" onClick={() => book(true)} className="font-semibold underline">{result.conflict}</button>}
        </p>
      )}
    </div>
  );
}
