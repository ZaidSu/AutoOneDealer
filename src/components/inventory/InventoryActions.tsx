"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notifyChanged } from "@/lib/client/live";
import { addSaleAction, importInventorySheetAction, importInventoryTextAction, resolveMissingCarAction, resolveMissingCarsAction, removeCarsAction, markAvailableAction, markSoldAction, removeCarAction, syncInventoryNowAction } from "@/app/actions";

type Msg = { ok: boolean; text: string } | null;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** "Check website now": reads the website's inventory right away instead of waiting for the daily 7 pm read. */
export function CheckNowButton() {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
        const r = await syncInventoryNowAction();
        setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
        router.refresh(); notifyChanged();
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
        setOpen(false); router.refresh(); notifyChanged();
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
    start(async () => { await markAvailableAction(id); router.refresh(); notifyChanged(); });
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

/** Paste the text of the website's inventory pages: the way to get the cars in when AutoDash can't read the website itself. */
export function ImportText() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Paste inventory text</button>;
  return (
    <div className="panel mb-6 p-4">
      <p className="font-semibold">Paste the website&apos;s inventory</p>
      <ol className="mt-1 list-decimal pl-5 text-sm text-muted">
        <li>Open each page of your website&apos;s Cars For Sale (page 1, 2, 3, 4…).</li>
        <li>On each page press <b>Ctrl+A</b>, then <b>Ctrl+C</b>, and paste it into the box below, one page after another.</li>
        <li>Click Import. Cars already here are updated; cars shown as Sold are marked sold.</li>
      </ol>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} rows={8} placeholder="Paste here…"
        className="mt-3 w-full rounded-md border border-line bg-white p-3 font-mono text-sm" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-red" disabled={pending || text.length < 200} onClick={() => start(async () => {
          const r = await importInventoryTextAction(text);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: r.message ?? "Imported." }); setText(""); router.refresh(); notifyChanged();
        })}>{pending ? "Importing…" : "Import"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
        {text.length > 0 && <span className="text-sm text-muted">{Math.round(text.length / 1000)}K characters pasted</span>}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}

/** Delete a car that isn't the dealership's. It disappears everywhere and stays deleted even if the website lists it. */
export function RemoveCar({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => {
    if (!window.confirm("Delete this car from AutoDash?\n\nUse this for cars that aren't yours. It won't show on the lot or in the sold list, the AI won't offer it, and it stays deleted even if your website lists it. You can restore it from Deleted cars at the bottom.")) return;
    start(async () => { await removeCarAction(id); router.refresh(); notifyChanged(); });
  }}>{pending ? "…" : "Delete"}</button>;
}

/** Put a deleted car back (it was deleted by mistake). */
export function RestoreCar({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await markAvailableAction(id); router.refresh(); notifyChanged(); })}>{pending ? "…" : "Restore"}</button>;
}


/** Upload the daily inventory sheet PDF from CarsForSale. */
export function UploadSheet() {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-1">
      <label className="btn btn-red cursor-pointer">
        {pending ? "Reading the sheet…" : "Upload inventory sheet (PDF)"}
        <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={pending} onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const form = new FormData();
          form.set("file", file);
          start(async () => {
            const r = await importInventorySheetAction(form);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
            router.refresh(); notifyChanged();
          });
        }} />
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`max-w-md text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}

/** Cars that were on the lot but are missing from the newest sheet: what happened to each? Check several and Sold / Remove them together. */
export function ConfirmMissing({ cars, sheetAt }: { cars: { id: string; title: string; vin: string | null; price: number | null; mileage: number | null }[]; sheetAt: number }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!cars.length) return null;
  const chosen = cars.filter((c) => picked.has(c.id)).map((c) => c.id);
  const allOn = chosen.length === cars.length;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = (r: { ok: boolean; message?: string; error?: string }) => {
    setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error ?? "Something went wrong." });
    setBusy(null); setPicked(new Set()); router.refresh(); notifyChanged();
  };
  const go = (id: string, choice: "sold" | "remove") => { setBusy(id); start(async () => done(await resolveMissingCarAction(id, choice))); };
  const goMany = (choice: "sold" | "remove") => {
    if (choice === "remove" && !window.confirm(`Remove ${chosen.length} car${chosen.length === 1 ? "" : "s"} from AutoDash?`)) return;
    setBusy("many"); start(async () => done(await resolveMissingCarsAction(chosen, choice)));
  };
  return (
    <section aria-labelledby="confirm" className="mb-6 rounded-xl border border-lane/40 bg-[#fff8e6] p-5">
      <h2 id="confirm" className="text-[17px] font-semibold">{cars.length} car{cars.length === 1 ? "" : "s"} left the inventory sheet</h2>
      <p className="mt-1 text-sm text-muted">
        {cars.length === 1 ? "This car is" : "These cars are"} not in the sheet from {new Date(sheetAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}, so {cars.length === 1 ? "it is" : "they are"} off the lot and the AI won&apos;t offer {cars.length === 1 ? "it" : "them"}.
        Say what happened: <b>Sold</b> counts it as a sale; <b>Remove</b> deletes it (not ours, or a mistake). Check the boxes to do several at once. If {cars.length === 1 ? "it was" : "one was"} left out by mistake, upload the sheet again with the car in it and it comes back.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-line/60 pb-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-signal" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(cars.map((c) => c.id)))} />
          {allOn ? "Uncheck all" : "Check all"}
        </label>
        <span className="text-sm text-muted">{chosen.length} checked</span>
        <button type="button" className="btn btn-red" disabled={pending || !chosen.length} onClick={() => goMany("sold")}>{busy === "many" ? "Saving…" : `Sold (${chosen.length})`}</button>
        <button type="button" className="btn" disabled={pending || !chosen.length} onClick={() => goMany("remove")}>Remove ({chosen.length})</button>
      </div>
      <ul className="divide-y divide-line/60">
        {cars.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-4 shrink-0 accent-signal" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Check ${c.title}`} />
              <span>
                <span className="block font-medium">{c.title}</span>
                <span className="block text-sm text-muted">{[c.vin ? `VIN ending ${c.vin.slice(-6)}` : null, c.mileage ? `${c.mileage.toLocaleString("en-US")} miles` : null, c.price ? `$${c.price.toLocaleString("en-US")}` : null].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-red" disabled={pending} onClick={() => go(c.id, "sold")}>{busy === c.id ? "Saving…" : "Sold"}</button>
              <button type="button" className="btn" disabled={pending} onClick={() => go(c.id, "remove")}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </section>
  );
}

export type LotRow = { id: string; title: string; url: string | null; imageUrl: string | null; photos: number; price: number | null; mileage: number | null; vin: string | null; firstSeen: string };

/** The cars on the lot, with a checkbox on each: check several and Delete selected. */
export function LotTable({ rows }: { rows: LotRow[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const chosen = rows.filter((r) => picked.has(r.id)).map((r) => r.id);
  const allOn = rows.length > 0 && chosen.length === rows.length;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const usd = (n: number | null) => (n == null ? "n/a" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-signal" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
          {allOn ? "Uncheck all" : `Check all ${rows.length} shown`}
        </label>
        {chosen.length > 0 && (
          <>
            <span className="text-sm text-muted">{chosen.length} checked</span>
            <button type="button" className="btn btn-red" disabled={pending} onClick={() => {
              if (!window.confirm(`Delete ${chosen.length} car${chosen.length === 1 ? "" : "s"} from AutoDash?\n\nThey leave the lot, the AI won't offer them, and they stay deleted even if your website lists them. You can restore them from Deleted cars at the bottom.`)) return;
              start(async () => {
                const r = await removeCarsAction(chosen);
                setMsg(r.ok ? { ok: true, text: r.message ?? "Deleted." } : { ok: false, text: r.error });
                setPicked(new Set()); router.refresh(); notifyChanged();
              });
            }}>{pending ? "Deleting…" : `Delete selected (${chosen.length})`}</button>
          </>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[15px]">
          <thead className="border-b border-line text-sm text-muted"><tr><th className="w-10 px-4 py-2.5"><span className="sr-only">Check</span></th><th className="px-4 py-2.5 font-semibold">Car</th><th className="px-4 py-2.5 font-semibold">Price</th><th className="px-4 py-2.5 font-semibold">Miles</th><th className="px-4 py-2.5 font-semibold">VIN</th><th className="px-4 py-2.5 font-semibold">First seen</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className={picked.has(c.id) ? "bg-warn-soft" : ""}>
                <td className="px-4 py-2.5"><input type="checkbox" className="size-4 accent-signal" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Check ${c.title}`} /></td>
                <td className="px-4 py-2.5 font-medium">
                  <span className="flex items-center gap-3">
                    {c.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" width={64} height={48} loading="lazy" className="h-12 w-16 shrink-0 rounded-md bg-line object-cover" />
                    )}
                    <span>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.title}</a> : c.title}{c.photos > 1 && <span className="font-normal text-muted"> · {c.photos} photos</span>}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{usd(c.price)}</td>
                <td className="px-4 py-2.5 tabular-nums">{c.mileage ? c.mileage.toLocaleString("en-US") : ""}</td>
                <td className="px-4 py-2.5 font-mono text-sm text-muted" title={c.vin ?? undefined}>{c.vin ? <><span>{c.vin.slice(0, -6)}</span><span className="font-semibold text-ink">{c.vin.slice(-6)}</span></> : <span title="Read from the car's own page a few cars at a time">not read yet</span>}</td>
                <td className="px-4 py-2.5 text-muted">{c.firstSeen}</td>
                <td className="px-4 py-2.5 text-right"><span className="inline-flex flex-wrap items-center justify-end gap-2"><MarkSold id={c.id} price={c.price} /><RemoveCar id={c.id} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
