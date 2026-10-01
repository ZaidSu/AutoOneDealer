"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSaleAction, markAvailableAction, markSoldAction, syncInventoryNowAction } from "@/app/actions";

type Msg = { ok: boolean; text: string } | null;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** "Check website now": reads the website's inventory right away instead of waiting for the 5-minute timer. */
export function CheckNowButton() {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
        const r = await syncInventoryNowAction();
        setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
        router.refresh();
      })}>{pending ? "Checking…" : "Check website now"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`max-w-xs text-right text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}

/** Mark a car sold: what it sold for and the day. */
export function MarkSold({ id, price }: { id: string; price: number | null }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(price ? String(price) : "");
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Mark sold</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-muted">Sold for $<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="ml-1 h-9 w-24 rounded-md border border-line bg-white px-2 text-[15px] text-ink" /></label>
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Sale date" className="h-9 rounded-md border border-line bg-white px-2 text-[15px] text-ink" />
      <button type="button" className="btn btn-sm btn-red" disabled={pending} onClick={() => start(async () => {
        const r = await markSoldAction(id, amount, date);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setOpen(false); router.refresh();
      })}>{pending ? "Saving…" : "Save"}</button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      {msg && <p role="alert" className="text-sm text-signal">{msg.text}</p>}
    </div>
  );
}

/** Undo a sale (it was marked sold by mistake, or came back). */
export function BackOnLot({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => {
    if (!window.confirm("Put this car back on the lot as available?")) return;
    start(async () => { await markAvailableAction(id); router.refresh(); });
  }}>{pending ? "…" : "Not sold"}</button>;
}

/** Log a car that sold before AutoDash started watching, so the numbers include it. */
export function AddSale() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", price: "", date: today() });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Add a past sale</button>;
  return (
    <div className="panel p-4">
      <p className="font-semibold">Add a car that already sold</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="field min-w-[220px] flex-1">Car<input className="input" placeholder="2019 Toyota Camry SE" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setMsg(null); }} /></label>
        <label className="field w-36">Sold for ($)<input className="input" inputMode="numeric" placeholder="14500" value={form.price} onChange={(e) => { setForm({ ...form, price: e.target.value }); setMsg(null); }} /></label>
        <label className="field w-44">Day sold<input type="date" className="input" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <button type="button" className="btn btn-red" disabled={pending} onClick={() => start(async () => {
          const r = await addSaleAction(form);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setForm({ title: "", price: "", date: today() }); setMsg({ ok: true, text: "Added." }); router.refresh();
        })}>{pending ? "Adding…" : "Add"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
