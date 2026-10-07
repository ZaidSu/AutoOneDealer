"use client";
// A contractor's own invoices to you: what they bought (and paid for each) and what they charge you for each. Pick an item from your
// list or type a new one. These are just for you: they never count in your sales, profit, analytics or taxes.
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import Empty from "@/components/ui/Empty";
import DeleteButton from "@/components/ui/DeleteButton";
import Stat from "@/components/ui/Stat";
import { contractorInvoiceList, contractorInvoiceTotals, money, round2, sheetDate } from "@/lib/calc";
import type { ContractorInvoice, ContractorInvoiceLine, Item } from "@/lib/types";

type Row = { key: number; name: string; upc: string; qty: string; buy: string; sell: string };
const blankRow = (key: number): Row => ({ key, name: "", upc: "", qty: "1", buy: "", sell: "" });
const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);
const field = "input";

export default function ContractorInvoices({ contractorId, first, invoices, lines, items, today, editable, save, remove }: {
  contractorId: string; first: string;
  /** Only this contractor's invoices and their items. */
  invoices: ContractorInvoice[]; lines: ContractorInvoiceLine[]; items: Item[];
  today: string; editable: boolean;
  save: (fd: FormData) => Promise<ActionResult>; remove: (id: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState<string | null>(null); // "new" or an invoice id
  const list = useMemo(() => contractorInvoiceList(contractorId, invoices, lines), [contractorId, invoices, lines]);
  const current = editing && editing !== "new" ? list.find((x) => x.invoice.id === editing) : undefined;

  // What this contractor paid and charged last time for an item, to start a new row from.
  const history = useMemo(() => {
    const byKey = new Map<string, { buy: number; sell: number; upc: string }>();
    const dateOf = new Map(invoices.map((i) => [i.id, i.invoiced_on]));
    for (const l of [...lines].sort((a, b) => (dateOf.get(a.invoice_id) ?? "").localeCompare(dateOf.get(b.invoice_id) ?? ""))) {
      const v = { buy: l.buy_price, sell: l.sell_price, upc: l.upc ?? "" };
      byKey.set(l.name.trim().toLowerCase(), v);
      if (l.upc) byKey.set(`upc:${l.upc}`, v);
    }
    return byKey;
  }, [invoices, lines]);

  // Names to suggest: your item list plus anything typed on earlier contractor invoices.
  const names = useMemo(() => [...new Set([...items.map((i) => i.name), ...lines.map((l) => l.name)])].sort((a, b) => a.localeCompare(b)), [items, lines]);

  return (
    <section className="card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2>{first}&rsquo;s invoices</h2>
        {editable && editing === null && <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>+ New invoice</button>}
      </div>
      <p className="mb-4 text-sm text-muted">
        What {first} bought, what {first} paid for each, and what {first} charges you. These are only for you: they are not part of your sales, profit, analytics or taxes.
      </p>

      {editing !== null && (
        <InvoiceForm key={editing} contractorId={contractorId} first={first} today={today} items={items} names={names} history={history}
          invoice={current?.invoice} lines={current?.lines} save={save} onDone={() => setEditing(null)} />
      )}

      {list.length === 0 ? (editing === null && <Empty title="No invoices yet">{editable ? `Click “New invoice” to add what ${first} bought.` : "Nothing has been added yet."}</Empty>) : (
        <div className="divide-y divide-line">
          {list.map((x) => (
            <details key={x.invoice.id} className="group py-1">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-1 py-3 hover:bg-bg [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="text-muted transition-transform group-open:rotate-90">▶</span>
                <span className="min-w-[6rem] font-extrabold">{sheetDate(x.invoice.invoiced_on)}</span>
                <span className="min-w-[8rem] flex-1 text-sm text-muted">{x.invoice.ref ? `${x.invoice.ref} · ` : ""}{x.units} item{x.units === 1 ? "" : "s"}</span>
                <span className="text-right"><span className="block text-xs text-muted">You owe {first}</span><span className="font-bold">{money(x.billed)}</span></span>
                <span className="text-right"><span className="block text-xs text-muted">{first} paid</span><span className="font-bold">{money(x.spent)}</span></span>
                <span className="text-right"><span className="block text-xs text-muted">{first} makes</span><span className={`font-bold ${x.profit < 0 ? "text-bad" : "text-go"}`}>{money(x.profit)}</span></span>
              </summary>
              <div className="mb-3 ml-6 mt-1 space-y-3 rounded-xl bg-bg p-4">
                <div className="overflow-x-auto">
                  <table className="data-table compact">
                    <thead><tr><th>Item</th><th>Last 4 UPC</th><th className="r">Qty</th><th className="r">{first} paid</th><th className="r">Charges you</th><th className="r">{first} makes</th></tr></thead>
                    <tbody>
                      {x.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="wrap">{l.name}</td><td>{l.upc ?? "—"}</td><td className="r">{l.qty}</td>
                          <td className="r">{money(l.buy_price)}</td><td className="r">{money(l.sell_price)}</td>
                          <td className={`r ${l.sell_price - l.buy_price < 0 ? "text-bad" : ""}`}>{money(round2((l.sell_price - l.buy_price) * l.qty))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {x.invoice.notes && <p className="text-sm"><span className="text-xs text-muted">Notes </span>{x.invoice.notes}</p>}
                {editable && (
                  <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3">
                    <button type="button" className="btn btn-sm" onClick={() => { setEditing(x.invoice.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                    <DeleteButton action={remove} id={x.invoice.id} confirmText={`Delete this ${money(x.billed)} invoice from ${first}?`} />
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function InvoiceForm({ contractorId, first, today, items, names, history, invoice, lines, save, onDone }: {
  contractorId: string; first: string; today: string; items: Item[]; names: string[];
  history: Map<string, { buy: number; sell: number; upc: string }>;
  invoice?: ContractorInvoice; lines?: ContractorInvoiceLine[];
  save: (fd: FormData) => Promise<ActionResult>; onDone: () => void;
}) {
  const router = useRouter();
  const counter = useRef(0);
  const next = () => ++counter.current;
  const [rows, setRows] = useState<Row[]>(() => lines?.length
    ? lines.map((l) => ({ key: next(), name: l.name, upc: l.upc ?? "", qty: String(l.qty), buy: l.buy_price ? String(l.buy_price) : "", sell: String(l.sell_price) }))
    : [blankRow(next())]);
  const [date, setDate] = useState(invoice?.invoiced_on ?? today);
  const [ref, setRef] = useState(invoice?.ref ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const live = contractorInvoiceTotals(rows.filter((r) => r.name.trim()).map((r, i) => ({
    id: String(i), invoice_id: "", name: r.name, upc: r.upc, qty: Math.round(num(r.qty)) || 0, buy_price: num(r.buy), sell_price: num(r.sell), position: i,
  })));
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Picking a name you've used fills in its last 4 and what they paid and charged last time. Typing a last 4 on an empty row finds the item.
  function nameChanged(r: Row, name: string) {
    const item = items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());
    const h = history.get(name.trim().toLowerCase()) ?? (item?.upc ? history.get(`upc:${item.upc}`) : undefined);
    setRow(r.key, { name, ...(item || h ? { upc: r.upc || item?.upc || h?.upc || "", buy: r.buy || (h?.buy ? String(h.buy) : ""), sell: r.sell || (h ? String(h.sell) : "") } : {}) });
  }
  function upcChanged(r: Row, upc: string) {
    const hits = r.name.trim() === "" && /^\d{4}$/.test(upc) ? items.filter((i) => i.upc === upc) : [];
    if (hits.length === 1) {
      const h = history.get(`upc:${upc}`) ?? history.get(hits[0].name.toLowerCase());
      setRow(r.key, { upc, name: hits[0].name, buy: r.buy || (h?.buy ? String(h.buy) : ""), sell: r.sell || (h ? String(h.sell) : "") });
    } else setRow(r.key, { upc });
  }

  function submit() {
    const fd = new FormData();
    if (invoice) fd.set("invoice_id", invoice.id);
    fd.set("contractor_id", contractorId); fd.set("invoiced_on", date); fd.set("ref", ref); fd.set("notes", notes);
    fd.set("lines", JSON.stringify(rows.filter((r) => r.name.trim() || r.sell.trim()).map((r) => ({ name: r.name, upc: r.upc, qty: r.qty, buy: r.buy, sell: r.sell }))));
    start(async () => {
      const r = await save(fd);
      if (r.ok) { router.refresh(); onDone(); } else setMsg({ ok: false, text: r.error });
    });
  }

  return (
    <div className="mb-5 grid gap-4 rounded-2xl border border-line p-4" onChange={() => msg && setMsg(null)}>
      <h3 className="text-[17px] font-extrabold">{invoice ? `Edit ${first}'s invoice` : `New invoice from ${first}`}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`You owe ${first}`} value={money(live.billed)} sub={`${live.units} item${live.units === 1 ? "" : "s"}`} />
        <Stat label={`${first} paid`} value={money(live.spent)} />
        <Stat label={`${first} makes`} value={money(live.profit)} strong bad={live.profit < 0} sub="What you owe minus what they paid" />
      </div>
      <fieldset disabled={pending} className="grid gap-3.5 sm:grid-cols-3">
        <label className="field">Date<input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Reference (optional)<input className={field} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Store order #, or what it was for" /></label>
        <label className="field">Notes (optional)<input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </fieldset>

      <datalist id="mw-contractor-item-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="overflow-x-auto">
        <table className="data-table compact w-full min-w-[760px] table-fixed">
          <colgroup><col /><col className="w-[6.5rem]" /><col className="w-[5.5rem]" /><col className="w-[8rem]" /><col className="w-[8rem]" /><col className="w-[7rem]" /><col className="w-[5.5rem]" /></colgroup>
          <thead><tr><th>Item (search or type)</th><th>Last 4 UPC</th><th className="r !pr-3.5">Qty</th><th className="r !pr-3.5">{first} paid each</th><th className="r !pr-3.5">Charges you each</th><th className="r">{first} makes</th><th /></tr></thead>
          <tbody className="[&_td]:align-middle">
            {rows.map((r) => {
              const q = Math.round(num(r.qty)) || 0, made = round2(q * (num(r.sell) - num(r.buy)));
              return (
                <tr key={r.key}>
                  <td><input list="mw-contractor-item-names" aria-label="Item name" className={`${field} !h-9`} value={r.name} disabled={pending} onChange={(e) => nameChanged(r, e.target.value)} placeholder="Item name" /></td>
                  <td><input aria-label="Last 4 of the UPC" inputMode="numeric" className={`${field} !h-9 !w-full`} value={r.upc} disabled={pending} onChange={(e) => upcChanged(r, e.target.value)} /></td>
                  <td><input aria-label="Quantity" type="number" min="1" step="1" className={`${field} !h-9 !w-full text-right`} value={r.qty} disabled={pending} onChange={(e) => setRow(r.key, { qty: e.target.value })} /></td>
                  <td><input aria-label="What they paid each" type="number" min="0" step="0.01" className={`${field} !h-9 !w-full text-right`} value={r.buy} disabled={pending} onChange={(e) => setRow(r.key, { buy: e.target.value })} /></td>
                  <td><input aria-label="What they charge you each" type="number" min="0" step="0.01" className={`${field} !h-9 !w-full text-right`} value={r.sell} disabled={pending} onChange={(e) => setRow(r.key, { sell: e.target.value })} /></td>
                  <td className={`r font-bold ${made < 0 ? "text-bad" : "text-go"}`}>{r.sell.trim() ? money(made) : "—"}</td>
                  <td className="r"><button type="button" aria-label="Remove this item" className="link-btn danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" onClick={() => setRows((rs) => [...rs, blankRow(next())])}>+ Add an item</button>
        <span className="text-sm text-muted">Example: {first} paid $79 and charges you $83, so {first} makes $4 on each.</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={submit}>{pending ? "Saving…" : invoice ? "Save changes" : "Save invoice"}</button>
        <button type="button" className="btn" disabled={pending} onClick={onDone}>Cancel</button>
        {msg && <p role="alert" className="text-sm font-semibold text-bad">{msg.text}</p>}
      </div>
    </div>
  );
}
