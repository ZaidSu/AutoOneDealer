"use client";
import { useState, useTransition } from "react";
import { createAppointmentAction } from "@/app/actions";

const input = "mt-1 h-10 w-full rounded-md border border-line bg-white px-2.5 text-[15px] text-ink";

export default function NewAppointment({ reps, today }: { reps: { id: number; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", vehicle: "", repId: "", date: today, time: "11:00", duration: "60", notes: "" });
  const [result, setResult] = useState<{ ok: boolean; text: string; conflict?: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setResult(null);
  };

  function submit(force = false) {
    if (!form.name.trim()) return setResult({ ok: false, text: "Enter the customer's name." });
    if (form.phone.replace(/\D/g, "").length < 10) return setResult({ ok: false, text: "Enter the customer's 10-digit phone number. It's required to book." });
    if (!form.date || !form.time) return setResult({ ok: false, text: "Pick a day and time." });
    start(async () => {
      const r = await createAppointmentAction({
        customerName: form.name, phone: form.phone, email: form.email, vehicle: form.vehicle, repId: form.repId ? Number(form.repId) : null,
        date: form.date, time: form.time, durationMin: Number(form.duration), notes: form.notes, force,
      });
      if (r.ok) {
        setResult({ ok: true, text: r.message ?? "Booked." });
        setForm({ ...form, name: "", phone: "", email: "", vehicle: "", notes: "" });
      } else setResult({ ok: false, text: r.error, conflict: r.conflict });
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark">
        New appointment
      </button>
    );
  }

  return (
    <section aria-label="New appointment" className="max-w-4xl rounded-lg border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">New appointment</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-muted hover:text-ink">Close</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-muted">Customer name<input className={input} value={form.name} onChange={set("name")} placeholder="Marcus Hill" /></label>
        <label className="text-sm text-muted">Phone <span className="text-signal">(required)</span><input className={input} value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="off" required aria-required="true" placeholder="(214) 555-0123" /></label>
        <label className="text-sm text-muted">Email<input type="email" className={input} value={form.email} onChange={set("email")} autoComplete="off" placeholder="name@example.com" /></label>
        <label className="text-sm text-muted">Car<input className={input} value={form.vehicle} onChange={set("vehicle")} placeholder="2014 Cadillac CTS" /></label>
        <label className="text-sm text-muted">Salesperson
          <select className={input} value={form.repId} onChange={set("repId")}>
            <option value="">Any salesperson</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Day<input type="date" min={today} className={input} value={form.date} onChange={set("date")} /></label>
        <label className="text-sm text-muted">Time<input type="time" step={900} className={input} value={form.time} onChange={set("time")} /></label>
        <label className="text-sm text-muted">Length
          <select className={input} value={form.duration} onChange={set("duration")}>
            <option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option>
            <option value="90">1.5 hours</option><option value="120">2 hours</option>
          </select>
        </label>
        <label className="text-sm text-muted">Notes<input className={input} value={form.notes} onChange={set("notes")} placeholder="Bringing trade-in" /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => submit(false)}
          className="h-10 rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark disabled:opacity-60">{pending ? "Booking…" : "Book appointment"}</button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-go" : "text-signal"}`}>
            {result.text}{" "}
            {result.conflict && <button type="button" onClick={() => submit(true)} className="font-semibold underline">{result.conflict}</button>}
          </p>
        )}
      </div>
    </section>
  );
}
