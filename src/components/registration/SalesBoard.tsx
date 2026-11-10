"use client";
// Registration area: type in a sale by hand (like DeskManager) and see the recent sales with where each registration stands.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logSaleAction, undoSaleAction } from "@/app/actions";
import { STAGE_LABEL, cleanStage } from "@/lib/registration/rules";
import type { LotCar, SaleRow } from "@/lib/registration/sales";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
const prettyPhone = (p: string | null) => (p ? p.replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") : "");
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const STAGE_COLOR: Record<string, string> = { waiting: "#6b7794", pickup: "#f08c00", picked: "#2f6fed", done: "#12a150" };

export default function SalesBoard({ sales, lot, today }: { sales: SaleRow[]; lot: LotCar[]; today: string }) {
  const router = useRouter();
  const blank = { carId: "", car: "", vin: "", price: "", date: today, name: "", phone: "", deferred: false };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");

  const pick = (id: string) => {
    const c = lot.find((x) => x.id === id);
    setF(c ? { ...f, carId: id, car: c.title, vin: c.vin ?? "", price: c.price ? String(c.price) : f.price } : { ...f, carId: "", car: "", vin: "" });
  };
  const save = () => start(async () => {
    const r = await logSaleAction(f);
    if (r.ok) { setMsg({ ok: true, text: r.message ?? "Saved." }); setF({ ...blank, date: today }); router.refresh(); }
    else setMsg({ ok: false, text: r.error });
  });
  const undo = (s: SaleRow) => {
    if (!s.regId || !window.confirm(`The sale to ${s.name || "this customer"} fell through?\n\nThe car goes back on the lot, the customer is no longer marked as a buyer, and this registration is removed.`)) return;
    start(async () => { const r = await undoSaleAction(s.regId!); setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Removed.") : r.error }); router.refresh(); });
  };
  const needle = q.trim().toLowerCase();
  const shown = sales.filter((s) => !needle || `${s.name ?? ""} ${s.vehicle ?? ""} ${s.phone ?? ""}`.toLowerCase().includes(needle));

  return (
    <div>
      <section id="log-sale" aria-labelledby="log-title" className="panel relative mb-8 scroll-mt-6 overflow-hidden p-5">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#2f6fed] via-[#0ca7a0] to-[#12a150]" />
        <h2 id="log-title" className="section-title">Log a sale</h2>
        <p className="mt-1 text-[15px] text-muted">
          Type the sale in here when a car is sold. The car moves to Sold, the customer is saved, a week later the AI texts to check in and ask for a Google review, and a registration is started for it.
        </p>
        {lot.length > 0 && (
          <label className="field mt-4">Pick the car from your lot <span className="font-normal text-muted">(or type it below)</span>
            <select className="input" value={f.carId} onChange={(e) => pick(e.target.value)}>
              <option value="">Choose a car…</option>
              {lot.map((c) => <option key={c.id} value={c.id}>{c.title}{c.price ? ` · ${money(c.price)}` : ""}</option>)}
            </select>
          </label>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="field">Car<input className="input" value={f.car} onChange={(e) => setF({ ...f, car: e.target.value, carId: "" })} placeholder="2019 Toyota Camry SE" /></label>
          <label className="field">VIN <span className="font-normal text-muted">(17 characters, so a car is never sold twice)</span><input className="input uppercase" value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase(), carId: "" })} maxLength={17} /></label>
          <label className="field">Sold for<input className="input" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$" /></label>
          <label className="field">Day of the sale<input className="input" type="date" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="field">Customer name<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Customer phone<input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(214) 555-0123" /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 font-medium"><input type="checkbox" className="size-4 accent-signal" checked={f.deferred} onChange={(e) => setF({ ...f, deferred: e.target.checked })} /> Deferred payment</label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-red" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save this sale"}</button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-[15px] font-medium ${msg.ok ? "text-go-dark" : "text-signal"}`}>{msg.text}</p>}
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="section-title">Recent sales <span className="text-muted">{sales.length}</span></h2>
        <input className="input mt-0 ml-auto h-10 max-w-[260px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or car" aria-label="Search sales" />
      </div>
      {shown.length === 0 ? <p className="panel p-6 text-muted">{sales.length ? "Nothing matches that search." : "No sales yet. Use Log a sale above."}</p> : (
        <ul className="grid gap-3">
          {shown.map((s) => {
            const stage = cleanStage(s.stage);
            return (
              <li key={s.key + s.purchasedAt} className="panel relative flex flex-wrap items-center gap-x-5 gap-y-2 overflow-hidden p-4 pl-5">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: stage ? STAGE_COLOR[stage] : "#c3cadb" }} />
                <div className="min-w-[220px] flex-1">
                  <p className="text-[17px] font-bold">{s.name || "No name"}{s.deferred && <span className="ml-2 rounded-full bg-signal px-2.5 py-0.5 align-middle text-xs font-bold text-white">Deferred payment</span>}</p>
                  <p className="text-[15px] text-muted">{s.vehicle || "Car not entered"}{s.price ? ` · ${money(s.price)}` : ""}{s.phone ? ` · ${prettyPhone(s.phone)}` : ""}</p>
                  <p className="text-sm text-faint">Bought {day(s.purchasedAt)}{s.vin ? ` · VIN ${s.vin}` : ""}</p>
                </div>
                <span className="rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: stage ? STAGE_COLOR[stage] : "#8792ad" }}>
                  {stage ? `Registration: ${STAGE_LABEL[stage]}` : "No registration yet"}
                </span>
                <div className="flex gap-2">
                  <a className="btn btn-sm" href="/registration">Open registration</a>
                  {s.regId && <button type="button" className="btn btn-sm text-signal" disabled={pending} onClick={() => undo(s)}>Sale fell through</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
