"use client";
import { notifyChanged } from "@/lib/client/live";
// Salesperson, status, financing, source, state, reminder, notes and booking for one customer.
// Used in the Customers list (expanded row) and on the customer's profile.
import { useState, useTransition } from "react";
import { createAppointmentAction, updateCustomerAction } from "@/app/actions";
import type { CustomerView } from "@/lib/customers/view";
import type { CustomerField } from "@/lib/db/data";
import { displayName, formatDateTime } from "@/lib/utils/format";

type Option = { value: string; label: string };
type Props = {
  view: CustomerView;
  setView: (v: CustomerView) => void;
  reps: { id: number; name: string }[];
  sources: string[];
  statuses: readonly Option[];
  financing: readonly Option[];
  today: string;
};

const select = "mt-1 h-10 w-full rounded-md border border-line bg-white px-2.5 text-[15px] text-ink disabled:bg-paper";

export default function CustomerEditor({ view, setView, reps, sources, statuses, financing, today }: Props) {
  const c = view;
  const [saving, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function save(field: CustomerField, value: string, patch: Partial<CustomerView>) {
    const previous = view;
    setView({ ...view, ...patch });
    start(async () => {
      const result = await updateCustomerAction(c.key, c.name, field, value);
      if (!result.ok) { setView(previous); setMessage({ ok: false, text: result.error }); }
      else { setMessage({ ok: true, text: "Saved" }); notifyChanged(); }
    });
  }
  const sourceOptions = Array.from(new Set([...(view.heardFrom ? [view.heardFrom] : []), ...sources]));

  return (
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

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm text-muted">Follow up on
                  <input type="date" min={today} value={view.followUpAt ?? ""} disabled={saving}
                    onChange={(e) => save("follow_up", e.target.value, { followUpAt: e.target.value || null })}
                    className="mt-1 block h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
                </label>
                {view.followUpAt && (
                  <button type="button" disabled={saving} onClick={() => save("follow_up", "", { followUpAt: null })}
                    className="h-10 text-sm font-semibold text-muted hover:text-ink">Clear reminder</button>
                )}
                <p className="pb-2 text-sm text-muted">Shows on the Dashboard on that day.</p>
              </div>

              <label className="mt-4 block text-sm text-muted">Notes
                <textarea defaultValue={view.notes} rows={2} placeholder="Called, wants to trade in a 2012 Accord"
                  onBlur={(e) => e.target.value !== view.notes && save("notes", e.target.value, { notes: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink" />
              </label>

              <BookAppointment customer={view} reps={reps} today={today} />
      {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-go" : "text-signal"}`}>{message.text}</p>}
    </>
  );
}

function BookAppointment({ customer, reps, today }: { customer: CustomerView; reps: { id: number; name: string }[]; today: string }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:00");
  const [repId, setRepId] = useState<string>(customer.repId ? String(customer.repId) : "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [name, setName] = useState(customer.name ? displayName(customer.name) : "");
  const [vehicle, setVehicle] = useState(customer.vehicles[0] ?? "");
  const [result, setResult] = useState<{ ok: boolean; text: string; conflict?: string } | null>(null);
  const [pending, start] = useTransition();

  function book(force = false) {
    if (!name.trim()) return setResult({ ok: false, text: "Add the customer's name to book." });
    if (vehicle.trim().length < 2) return setResult({ ok: false, text: "Add the car they're coming to see." });
    if (!date) return setResult({ ok: false, text: "Pick a day first." });
    if (phone.replace(/\D/g, "").length < 10) return setResult({ ok: false, text: "Add the customer's 10-digit phone number to book." });
    start(async () => {
      const r = await createAppointmentAction({
        customerKey: customer.key, customerName: name, phone, email: customer.email,
        vehicle, repId: repId ? Number(repId) : null, date, time, force,
      });
      setResult(r.ok ? { ok: true, text: r.message ?? "Booked." } : { ok: false, text: r.error, conflict: r.conflict });
      if (r.ok) notifyChanged();
    });
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        {customer.nextAppointment ? `Next appointment: ${formatDateTime(customer.nextAppointment.at)}${customer.nextAppointment.repName ? ` with ${customer.nextAppointment.repName}` : ""}. Book another:` : "Book an appointment:"}
      </p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <label className="text-sm text-muted"><span className="sr-only">Customer name (required)</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setResult(null); }} placeholder="Customer name (required)" required
            className="h-10 w-44 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
        <label className="text-sm text-muted"><span className="sr-only">Car (required)</span>
          <input value={vehicle} onChange={(e) => { setVehicle(e.target.value); setResult(null); }} placeholder="Car (required)" required
            className="h-10 w-48 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
        {!customer.phone && (
          <label className="text-sm text-muted"><span className="sr-only">Phone (required)</span>
            <input value={phone} onChange={(e) => { setPhone(e.target.value); setResult(null); }} inputMode="tel" placeholder="Phone (required)"
              className="h-10 w-40 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
          </label>
        )}
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
