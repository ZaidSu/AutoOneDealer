"use client";
// "Add customer": for walk-ins, phone calls and referrals that didn't come in as a lead email.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCustomerAction } from "@/app/actions";

const EMPTY = { name: "", phone: "", email: "", vehicle: "", heardFrom: "", notes: "", purchased: false, purchasedOn: "" };

export default function AddCustomer({ sources = [] }: { sources?: string[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: Exclude<keyof typeof EMPTY, "purchased">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setForm({ ...form, [k]: e.target.value }); setError(""); };
  const save = () => start(async () => {
    const r = await addCustomerAction(form);
    if (!r.ok) return setError(r.error);
    setForm(EMPTY); setOpen(false);
    if (r.key) router.push(`/customers/${encodeURIComponent(r.key)}`);
  });

  const button = <button type="button" className="btn btn-red" onClick={() => setOpen(true)}>Add customer</button>;
  if (!open) return button;
  return (
    <>
    {button}
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/30 p-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
    <div role="dialog" aria-modal="true" aria-label="Add a customer" className="panel w-full max-w-2xl p-6 text-left shadow-xl"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Add a customer</h2>
        <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={() => { setOpen(false); setError(""); }}>Close</button>
      </div>
      <p className="mt-1 text-sm text-muted">For walk-ins, phone calls and referrals. Name, plus a phone number or email.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="field">Name <span className="text-signal">*</span><input className="input" value={form.name} onChange={set("name")} placeholder="Marcus Hill" autoFocus /></label>
        <label className="field">Phone<input className="input" value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="(214) 555-0123" /></label>
        <label className="field">Email<input className="input" value={form.email} onChange={set("email")} inputMode="email" placeholder="name@example.com" /></label>
        <label className="field">{form.purchased ? "Car they bought" : "Car they're interested in"}<input className="input" value={form.vehicle} onChange={set("vehicle")} placeholder="2019 Toyota Camry" /></label>
        <label className="field">Heard about us
          {sources.length ? (
            <select className="input" value={form.heardFrom} onChange={set("heardFrom")}><option value="">Not known</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
          ) : <input className="input" value={form.heardFrom} onChange={set("heardFrom")} placeholder="Drive-by" />}
        </label>
        <label className="flex items-center gap-2 text-[15px] sm:col-span-2">
          <input type="checkbox" checked={form.purchased} onChange={(e) => { setForm({ ...form, purchased: e.target.checked }); setError(""); }} />
          They already bought a car (the AI will text them a follow-up a week later)
        </label>
        {form.purchased && (
          <label className="field sm:col-span-2">Day they bought it (leave blank for today)
            <input type="date" className="input" value={form.purchasedOn} max={new Date().toISOString().slice(0, 10)} onChange={set("purchasedOn")} />
          </label>
        )}
        <label className="field sm:col-span-2">Notes<input className="input" value={form.notes} onChange={set("notes")} placeholder="Wants to trade in a 2012 Accord" /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-red" disabled={pending} onClick={save}>{pending ? "Adding…" : "Add customer"}</button>
        {error && <p role="alert" className="text-sm text-signal">{error}</p>}
      </div>
    </div>
    </div>
    </>
  );
}
