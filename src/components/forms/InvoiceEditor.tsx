"use client";
// The one form for an invoice or purchase order, with all of its items. It's used to start a new one (blank, or filled in from a PDF),
// and to change a saved one. What they owe you, the cost of goods and the profit update as you type.
import { useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import Stat from "@/components/ui/Stat";
import { DEFAULT_MILES, DEFAULT_TAX_RATE, lockedMessage, money, quarterLabel, quarterOf, round2, sheetDate, totalsOf } from "@/lib/calc";
import type { ParsedInvoice } from "@/lib/invoice-parse";
import type { Contractor, Customer, Invoice, InvoiceLine, Item, QuarterRecord, TaxStatus } from "@/lib/types";
import StorePicker from "./StorePicker";

type Row = { key: number; name: string; upc: string; qty: string; price: string; cost: string; ownCard: boolean };
const blankRow = (key: number): Row => ({ key, name: "", upc: "", qty: "1", price: "", cost: "", ownCard: true });
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export type Props = {
  action: (fd: FormData) => Promise<ActionResult>;
  customers: Customer[]; contractors: Contractor[]; items: Item[];
  /** What each item last sold for and cost, to start a new row from. */
  history: Record<string, { price: number; cost: number }>;
  quarters: QuarterRecord[];
  /** Names of your cards used on earlier invoices, offered as suggestions. */
  cardNames?: string[];
  today: string;
  /** A saved invoice being changed. */
  invoice?: Invoice; lines?: InvoiceLine[];
  /** What was read from a PDF, and the PDF itself (attached when saved). */
  prefill?: ParsedInvoice; file?: File | null; startCustomerId?: string;
  readOnly?: boolean; lockedNote?: string | null;
  onSaved?: (id: string) => void; onCancel?: () => void;
};

export default function InvoiceEditor(p: Props) {
  const { invoice, prefill } = p;
  const itemName = (id: string) => p.items.find((i) => i.id === id);
  const detected = prefill?.customer ? p.customers.find((c) => c.name.toLowerCase() === prefill.customer!.toLowerCase()) ?? p.customers.find((c) => prefill.customer!.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(prefill.customer!.toLowerCase())) : undefined;

  const counter = useRef(0);
  const next = () => ++counter.current;
  const [rows, setRows] = useState<Row[]>(() => {
    if (invoice) {
      const mine = (p.lines ?? []).filter((l) => l.invoice_id === invoice.id).sort((a, b) => a.position - b.position);
      return mine.length ? mine.map((l) => ({ key: next(), name: itemName(l.item_id)?.name ?? "", upc: itemName(l.item_id)?.upc ?? "", qty: String(l.qty), ownCard: l.own_card !== false, price: String(l.unit_price), cost: l.unit_cost ? String(l.unit_cost) : "" })) : [];
    }
    if (prefill?.lines.length) return prefill.lines.map((l) => {
      const known = p.items.find((i) => i.name.toLowerCase() === l.name.toLowerCase() && (!l.upc || !i.upc || i.upc === l.upc));
      return { key: next(), name: l.name, upc: l.upc || known?.upc || "", qty: String(l.qty), ownCard: true, price: String(l.price), cost: known && p.history[known.id]?.cost ? String(p.history[known.id].cost) : "" };
    });
    return [blankRow(next())];
  });
  const [kind, setKind] = useState<"invoice" | "po">(invoice?.kind ?? prefill?.kind ?? "invoice");
  const [no, setNo] = useState(invoice?.invoice_no ?? prefill?.invoiceNo ?? "");
  const [customer, setCustomer] = useState(invoice?.customer_id ?? detected?.id ?? (prefill?.customer ? "new" : p.startCustomerId || p.customers[0]?.id || "new"));
  const [newCustomer, setNewCustomer] = useState(!invoice && !detected ? prefill?.customer ?? "" : "");
  const [date, setDate] = useState(invoice?.invoice_date ?? prefill?.date ?? p.today);
  const [miles, setMiles] = useState(invoice ? str(invoice.miles || null) : String(DEFAULT_MILES));
  const [store, setStore] = useState(invoice?.store ?? "");
  const [taxStatus, setTaxStatus] = useState<TaxStatus>(invoice?.tax_status ?? (prefill?.tax ? "taxable" : p.customers.find((c) => c.id === (detected?.id ?? p.startCustomerId))?.default_tax_status ?? "resale"));
  const [tax, setTax] = useState(invoice?.sales_tax ? String(invoice.sales_tax) : prefill?.tax ? String(prefill.tax) : "");
  const [totalOverride, setTotalOverride] = useState(str(invoice?.total_override));
  const [costOverride, setCostOverride] = useState(str(invoice?.cost_override));
  const [theirCard, setTheirCard] = useState(str(invoice?.their_card));
  const [myCard, setMyCard] = useState(invoice?.my_card ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [paid, setPaid] = useState(false);
  const [paidOn, setPaidOn] = useState(p.today);
  const [more, setMore] = useState(Boolean(invoice && (invoice.store || invoice.tax_status !== "resale" || invoice.notes)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);
  const live = useMemo(() => totalsOf(
    { tax_status: taxStatus, sales_tax: num(tax), total_override: totalOverride.trim() === "" ? null : num(totalOverride), cost_override: costOverride.trim() === "" ? null : num(costOverride), their_card: theirCard.trim() === "" ? null : num(theirCard), miles: num(miles) },
    rows.filter((r) => r.name.trim()).map((r) => ({ qty: Math.round(num(r.qty)) || 0, unit_price: num(r.price), unit_cost: num(r.cost), own_card: r.ownCard })),
  ), [rows, taxStatus, tax, totalOverride, costOverride, theirCard, miles]);
  const itemsTheirs = rows.reduce((a, r) => a + (r.ownCard ? 0 : (Math.round(num(r.qty)) || 0) * num(r.cost)), 0);

  const lock = p.readOnly || lockedMessage(p.quarters, [date, invoice?.invoice_date]);
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Typing a name you've used before fills in its last 4, price and cost. Typing a last 4 on an empty row finds the item.
  function nameChanged(r: Row, name: string) {
    const hit = p.items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());
    const h = hit ? p.history[hit.id] : undefined;
    setRow(r.key, { name, ...(hit ? { upc: r.upc || hit.upc || "", price: r.price || (h ? String(h.price) : ""), cost: r.cost || (h?.cost ? String(h.cost) : "") } : {}) });
  }
  function upcChanged(r: Row, upc: string) {
    const hits = r.name.trim() === "" && /^\d{4}$/.test(upc) ? p.items.filter((i) => i.upc === upc) : [];
    if (hits.length === 1) {
      const h = p.history[hits[0].id];
      setRow(r.key, { upc, name: hits[0].name, price: r.price || (h ? String(h.price) : ""), cost: r.cost || (h?.cost ? String(h.cost) : "") });
    } else setRow(r.key, { upc });
  }

  const pdfGap = prefill?.total != null && Math.abs(prefill.total - (live.subtotal + live.tax)) > 0.005 ? prefill.total : null;

  function save() {
    const fd = new FormData();
    if (invoice) fd.set("invoice_id", invoice.id);
    fd.set("kind", kind); fd.set("invoice_no", no); fd.set("invoice_date", date);
    if (customer === "new") fd.set("new_customer_name", newCustomer); else fd.set("customer_id", customer);
    fd.set("miles", miles); fd.set("store", store); fd.set("contractor_id", invoice?.contractor_id ?? ""); fd.set("tax_status", taxStatus); fd.set("sales_tax", tax);
    fd.set("total_override", totalOverride); fd.set("cost_override", costOverride); fd.set("their_card", theirCard); fd.set("my_card", myCard); fd.set("notes", notes); fd.set("status", paid ? "paid" : "unpaid"); fd.set("paid_on", paidOn);
    fd.set("lines", JSON.stringify(rows.filter((r) => r.name.trim() || r.price.trim()).map((r) => ({ name: r.name, upc: r.upc, qty: r.qty, price: r.price, cost: r.cost, own_card: r.ownCard }))));
    if (p.file) fd.set("file", p.file);
    start(async () => {
      const r = await p.action(fd);
      if (r.ok) { setMsg({ ok: true, text: r.message ?? "Saved." }); if (r.id) p.onSaved?.(r.id); } else setMsg({ ok: false, text: r.error });
    });
  }

  const po = kind === "po";
  const field = "input";
  return (
    <div className="grid gap-4" onChange={() => msg && setMsg(null)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={invoice?.status === "paid" ? "They paid" : "They owe you"} value={money(live.owed)} sub={live.theirCard > 0 ? `${money(live.theirCard)} was bought on their card, so not included` : live.tax > 0 ? `includes ${money(live.tax)} sales tax` : `${live.units} item${live.units === 1 ? "" : "s"}`} />
        <Stat label="Cost of goods" value={money(live.cogs)} />
        <Stat label="Profit" value={money(live.profit)} strong bad={live.profit < 0} sub="Sales before tax minus cost of goods" />
        <Stat label="Business miles" value={`${live.miles} mi`} sub="One trip, counted once" />
      </div>

      {prefill && !invoice && (
        <p role="status" className="rounded-xl border border-[#f0d9a8] bg-accent-soft px-4 py-3 text-[15px] font-semibold text-[#6b4a00]">
          {prefill.lines.length ? `I found ${prefill.lines.length} item${prefill.lines.length === 1 ? "" : "s"} in ${p.file?.name ?? "your PDF"}. Check them, add what each one cost, then save.`
            : `I couldn't find items in ${p.file?.name ?? "that file"} (it may be a photo or scan). It will still be attached. Type the items in below.`}
        </p>
      )}
      {lock && <p role="alert" className="rounded-xl border border-[#f0d9a8] bg-accent-soft px-4 py-3 font-semibold text-[#6b4a00]">{p.lockedNote ?? lock}</p>}

      <section className="card">
        <fieldset disabled={Boolean(lock) || pending} className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">Type
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value as "invoice" | "po")}>
              <option value="invoice">Invoice I made</option><option value="po">PO from the customer</option>
            </select>
          </label>
          <label className="field">{po ? "PO number" : "Invoice number"}<input className={field} value={no} onChange={(e) => setNo(e.target.value)} placeholder={po ? "Their PO number" : "From Wave"} /></label>
          <label className="field">Customer
            <select className={field} value={customer} onChange={(e) => { setCustomer(e.target.value); const c = p.customers.find((x) => x.id === e.target.value); if (c && !invoice) setTaxStatus(c.default_tax_status); }}>
              {p.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">+ New customer…</option>
            </select>
          </label>
          <label className="field">Date<input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="mt-1 block text-xs font-normal text-muted">
              {prefill && !invoice ? (prefill.date ? (date === prefill.date ? `Read from the PDF (${sheetDate(prefill.date)}). ` : "You changed the date from the PDF. ") : "No date found in the PDF, check this one. ") : ""}
              {date ? `Counts in ${quarterLabel(quarterOf(date).year, quarterOf(date).quarter)}.` : ""}
            </span>
          </label>
          {customer === "new" && <label className="field sm:col-span-2">New customer&rsquo;s name<input className={field} value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} /></label>}
          <label className="field">Business miles driven<input type="number" min="0" step="0.1" className={field} value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="0" /><span className="mt-1 block text-xs font-normal text-muted">Filled in with your usual trip. Change it if this one was different.</span></label>
        </fieldset>

        <details className="mt-4" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-sm font-bold">
            More: store, tax, notes
            <span className="ml-2 font-normal text-muted">{[store || null, taxStatus === "taxable" ? "Taxable" : taxStatus === "exempt" ? "Exempt" : "Resale (no tax)"].filter(Boolean).join(" · ")}</span>
          </summary>
          <fieldset disabled={Boolean(lock) || pending} className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4"><StorePicker value={store} onChange={setStore} /></div>
            <label className="field">Tax
              <select className={field} value={taxStatus} onChange={(e) => setTaxStatus(e.target.value as TaxStatus)}>
                <option value="resale">Resale (no tax)</option><option value="exempt">Exempt (no tax)</option><option value="taxable">Taxable</option>
              </select>
            </label>
            {taxStatus === "taxable" && (
              <label className="field">Sales tax charged ($)
                <span className="flex gap-2">
                  <input type="number" min="0" step="0.01" className={field} value={tax} onChange={(e) => setTax(e.target.value)} />
                  <button type="button" className="btn btn-sm shrink-0" onClick={() => setTax(String(round2((live.subtotal * DEFAULT_TAX_RATE) / 100)))}>{DEFAULT_TAX_RATE}%</button>
                </span>
              </label>
            )}
            <label className="field sm:col-span-2">Notes<input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </fieldset>
        </details>
      </section>

      <section className="card !px-3">
        <h2 className="mb-3 px-1.5">Items</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1.5 text-sm">
          <span className="text-muted">Bought with</span>
          <button type="button" className="btn btn-sm" disabled={Boolean(lock)} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, ownCard: true })))}>My card (all)</button>
          <button type="button" className="btn btn-sm" disabled={Boolean(lock)} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, ownCard: false })))}>Their card (all)</button>
          <span className="text-xs text-muted">Items on their card: they paid the store, so they only owe you your profit on them.</span>
        </div>
        <datalist id="mw-item-names">{p.items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        <div className="overflow-x-auto">
          <table className="data-table compact w-full min-w-[820px] table-fixed">
            <colgroup><col /><col className="w-[6.5rem]" /><col className="w-[5.5rem]" /><col className="w-[8rem]" /><col className="w-[8rem]" /><col className="w-[7rem]" /><col className="w-[7.5rem]" /><col className="w-[5.5rem]" /></colgroup>
            <thead>
              <tr><th>Item</th><th>Last 4 UPC</th><th className="r !pr-3.5">Qty</th><th className="r !pr-3.5">Selling price</th><th className="r !pr-3.5">Buying price</th><th className="r">Profit</th><th>Bought with</th><th /></tr>
            </thead>
            <tbody className="[&_td]:align-middle">
              {rows.map((r) => {
                const prof = round2((Math.round(num(r.qty)) || 0) * (num(r.price) - num(r.cost)));
                return (
                  <tr key={r.key}>
                    <td><input list="mw-item-names" aria-label="Item name" className={`${field} !h-9`} value={r.name} disabled={Boolean(lock)} onChange={(e) => nameChanged(r, e.target.value)} placeholder="Item name" /></td>
                    <td><input aria-label="Last 4 of the UPC" inputMode="numeric" className={`${field} !h-9 !w-full`} value={r.upc} disabled={Boolean(lock)} onChange={(e) => upcChanged(r, e.target.value)} /></td>
                    <td><input aria-label="Quantity" type="number" min="1" step="1" className={`${field} !h-9 !w-full text-right`} value={r.qty} disabled={Boolean(lock)} onChange={(e) => setRow(r.key, { qty: e.target.value })} /></td>
                    <td><input aria-label="Selling price each" type="number" min="0" step="0.01" className={`${field} !h-9 !w-full text-right`} value={r.price} disabled={Boolean(lock)} onChange={(e) => setRow(r.key, { price: e.target.value })} /></td>
                    <td><input aria-label="Buying price each" type="number" min="0" step="0.01" className={`${field} !h-9 !w-full text-right`} value={r.cost} disabled={Boolean(lock)} onChange={(e) => setRow(r.key, { cost: e.target.value })} /></td>
                    <td className={`r font-bold ${prof < 0 ? "text-bad" : "text-go"}`}>{r.price.trim() ? money(prof) : "—"}</td>
                    <td><select aria-label="Bought with" className={`${field} !h-9 !w-full`} value={r.ownCard ? "mine" : "theirs"} disabled={Boolean(lock)} onChange={(e) => setRow(r.key, { ownCard: e.target.value === "mine" })}><option value="mine">My card</option><option value="theirs">Their card</option></select></td>
                    <td className="r">{!lock && <button type="button" aria-label="Remove this item" className="link-btn danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Remove</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!lock && <button type="button" className="btn btn-sm mx-1.5 mt-3" onClick={() => setRows((rs) => [...rs, blankRow(next())])}>+ Add an item</button>}

        <div className="mx-1.5 mt-5 grid gap-3.5 border-t border-line pt-4 sm:grid-cols-2">
          <label className="field">Total they owe you (leave blank to use the items{live.tax > 0 ? " plus tax" : ""})
            <input type="number" min="0" step="0.01" className={field} disabled={Boolean(lock)} value={totalOverride} onChange={(e) => setTotalOverride(e.target.value)} placeholder={money(live.subtotal + live.tax)} />
          </label>
          <label className="field">Total cost of goods (leave blank to add up each item&rsquo;s buying price)
            <input type="number" min="0" step="0.01" className={field} disabled={Boolean(lock)} value={costOverride} onChange={(e) => setCostOverride(e.target.value)} placeholder={money(rows.reduce((a, r) => a + (Math.round(num(r.qty)) || 0) * num(r.cost), 0))} />
          </label>
        </div>
        <div className="mx-1.5 mt-5 border-t border-line pt-4">
          <h3 className="text-[15px] font-extrabold">Which card paid for the goods</h3>
          <p className="mt-0.5 text-sm text-muted">Some on their card and some on yours? Type how much went on theirs. They owe you the rest (your profit on what they paid for), and the profit stays the same.</p>
          <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
            <label className="field">Spent on their card ($)
              <input type="number" min="0" step="0.01" className={field} disabled={Boolean(lock)} value={theirCard} onChange={(e) => setTheirCard(e.target.value)} placeholder={`${money(itemsTheirs)} (from the Bought with column)`} />
            </label>
            <label className="field">Which of my cards
              <input list="mw-card-names" className={field} disabled={Boolean(lock)} value={myCard} onChange={(e) => setMyCard(e.target.value)} placeholder="e.g. Chase Ink, Amex Gold" />
              <datalist id="mw-card-names">{(p.cardNames ?? []).map((n) => <option key={n} value={n} />)}</datalist>
            </label>
          </div>
          <p className="mt-3 rounded-lg bg-bg px-3 py-2 text-sm">
            Goods cost <b>{money(live.cogs)}</b>: <b>{money(live.theirCard)}</b> on their card, <b>{money(live.myCard)}</b> on {myCard.trim() ? myCard.trim() : "my card"}.
            {" "}They owe you <b>{money(live.owed)}</b>. Your profit is <b className={live.profit < 0 ? "text-bad" : "text-go"}>{money(live.profit)}</b>.
          </p>
        </div>
        {pdfGap !== null && !lock && (
          <p className="mx-1.5 mt-3 text-sm font-semibold text-accent-ink">
            The PDF says the total is {money(pdfGap)}, but these items come to {money(live.owed)}. Fix an item, or{" "}
            <button type="button" className="link-btn" onClick={() => setTotalOverride(String(pdfGap))}>use the PDF&rsquo;s total</button>.
          </p>
        )}
        {live.gap !== 0 && totalOverride.trim() !== "" && <p className="mx-1.5 mt-3 text-sm text-muted">Items add up to {money(live.subtotal + live.tax)}; you typed {money(live.owed)}.</p>}
      </section>

      {!lock && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : invoice ? "Save changes" : "Save invoice"}</button>
          {!invoice && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#10233f]" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Already paid</label>}
          {!invoice && paid && <label className="flex items-center gap-2 text-sm text-muted">on <input type="date" aria-label="Day the payment arrived" className="input !h-9 !w-auto !text-sm" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>}
          {p.onCancel && <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>}
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-go" : "text-bad"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
