"use client";
// The one "Record a sale" form, used on the Inventory page (in a pop-up) and on Registration → Recent sales.
// Find the car on the lot (or add one that isn't listed), the price and day, the main buyer, and an optional co-buyer.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logSaleAction } from "@/app/actions";
import type { LotCar } from "@/lib/registration/sales";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function RecordSaleForm({ lot, today, onSaved }: { lot: LotCar[]; today: string; onSaved?: () => void }) {
  const router = useRouter();
  const blank = { carId: "", car: "", vin: "", price: "", date: today, name: "", phone: "", coName: "", coPhone: "", deferred: false };
  const [f, setF] = useState(blank);
  const [manual, setManual] = useState(false); // the car isn't on the lot: type it in
  const [hasCo, setHasCo] = useState(false);
  const [lq, setLq] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const needle = lq.trim().toLowerCase();
  const results = needle.length < 3 ? [] : lot.filter((c) => (c.vin ?? "").toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle)).slice(0, 6);

  const pick = (c: LotCar) => { setF({ ...f, carId: c.id, car: c.title, vin: c.vin ?? "", price: c.price ? String(c.price) : f.price }); setMsg(null); };
  const clearCar = () => { setF({ ...f, carId: "", car: "", vin: "" }); setLq(""); setManual(false); };
  const save = () => start(async () => {
    const r = await logSaleAction({ ...f, coName: hasCo ? f.coName : "", coPhone: hasCo ? f.coPhone : "" });
    if (r.ok) { setMsg({ ok: true, text: r.message ?? "Sale saved." }); setF({ ...blank, date: today }); setLq(""); setManual(false); setHasCo(false); router.refresh(); onSaved?.(); }
    else setMsg({ ok: false, text: r.error });
  });

  return (
    <div>
      {/* 1. The car */}
      <div className="field">
        <span className="font-semibold">1. The car</span>
        {f.carId ? (
          <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl bg-go-soft px-4 py-3 ring-1 ring-go/30">
            <span className="font-semibold">✓ {f.car}</span>{f.vin && <span className="text-sm text-muted">VIN {f.vin}</span>}
            <button type="button" className="btn btn-sm ml-auto" onClick={clearCar}>Change car</button>
          </div>
        ) : manual ? (
          <div className="mt-1 rounded-xl bg-paper p-4 ring-1 ring-line">
            <p className="mb-3 text-sm text-muted">Type in the car that isn&apos;t on your lot.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">Car<input className="input" value={f.car} onChange={(e) => setF({ ...f, car: e.target.value })} placeholder="2019 Toyota Camry SE" /></label>
              <label className="field">VIN <span className="font-normal text-muted">(17 characters)</span><input className="input uppercase" value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} maxLength={17} /></label>
            </div>
            <button type="button" className="btn btn-sm mt-3" onClick={clearCar}>← Search the lot instead</button>
          </div>
        ) : (
          <>
            <input className="input" value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Search your lot by VIN or car name" aria-label="Search the lot" autoComplete="off" />
            {lq.trim().length >= 3 && results.length > 0 && (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
                {results.map((c) => (
                  <li key={c.id}><button type="button" onClick={() => pick(c)} className="flex w-full flex-wrap items-center gap-x-3 px-4 py-2.5 text-left hover:bg-paper">
                    <span className="font-semibold">{c.title}</span>{c.price ? <span className="text-muted">{money(c.price)}</span> : null}
                    <span className="ml-auto text-xs text-muted">{c.vin ? `VIN ${c.vin}` : "VIN not read yet"}</span>
                  </button></li>
                ))}
              </ul>
            )}
            {lq.trim().length >= 3 && results.length === 0 && <p className="mt-2 text-sm text-muted">No car on your lot matches that.</p>}
            <button type="button" className="mt-2 text-[15px] font-semibold text-signal hover:underline" onClick={() => { setManual(true); setLq(""); }}>Car not on the lot? Add it here</button>
          </>
        )}
      </div>

      {/* 2. The sale */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="field"><span className="font-semibold">2. Sold for</span><input className="input" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$" /></label>
        <label className="field"><span className="font-semibold">Day of the sale</span><input className="input" type="date" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      </div>

      {/* 3. The buyers */}
      <div className="mt-5">
        <span className="font-semibold">3. Who bought it</span>
        <div className="mt-1 rounded-xl bg-paper p-4 ring-1 ring-line">
          <p className="text-sm font-bold uppercase tracking-wide text-muted">Main buyer</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="field">Name<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="field">Phone<input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(214) 555-0123" /></label>
          </div>
          {hasCo ? (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-wide text-muted">Co-buyer</p>
                <button type="button" className="text-sm font-semibold text-signal hover:underline" onClick={() => { setHasCo(false); setF({ ...f, coName: "", coPhone: "" }); }}>Remove co-buyer</button>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="field">Name<input className="input" value={f.coName} onChange={(e) => setF({ ...f, coName: e.target.value })} /></label>
                <label className="field">Phone<input className="input" inputMode="tel" value={f.coPhone} onChange={(e) => setF({ ...f, coPhone: e.target.value })} placeholder="(214) 555-0123" /></label>
              </div>
              <p className="mt-2 text-sm text-muted">The AI follows up with both of them.</p>
            </div>
          ) : (
            <button type="button" className="mt-4 text-[15px] font-semibold text-signal hover:underline" onClick={() => setHasCo(true)}>+ Add a co-buyer</button>
          )}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 font-medium"><input type="checkbox" className="size-4 accent-signal" checked={f.deferred} onChange={(e) => setF({ ...f, deferred: e.target.checked })} /> Deferred payment</label>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-red" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save this sale"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-[15px] font-medium ${msg.ok ? "text-go-dark" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
