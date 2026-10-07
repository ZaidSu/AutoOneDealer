import Link from "next/link";
import InvoiceStart from "@/components/forms/InvoiceStart";
import { CardControl, PaymentControl } from "@/components/forms/RowControls";
import Badge from "@/components/ui/Badge";
import DeleteButton from "@/components/ui/DeleteButton";
import Empty from "@/components/ui/Empty";
import ExportLink from "@/components/ui/ExportLink";
import FileLink from "@/components/ui/FileLink";
import FilterBar from "@/components/ui/FilterBar";
import PageHeader from "@/components/ui/PageHeader";
import { cardNames, cardSpend, docShort, invoiceTotalsMap, lastPrices, lockedMessage, money, num, round2, sheetDate, yearOf } from "@/lib/calc";
import type { ViewProps } from "./types";

export default function InvoicesView({ data, params, editable, act, today }: ViewProps) {
  const { invoices, customers, items, lines, contractors } = data;
  const totals = invoiceTotalsMap(invoices, lines);

  const years = [...new Set(invoices.map((i) => yearOf(i.invoice_date)))].sort((a, b) => b - a);
  const year = years.includes(Number(params.year)) ? String(params.year) : "all";
  const status = params.status === "paid" || params.status === "unpaid" ? params.status : "all";
  const quarter = ["1", "2", "3", "4"].includes(String(params.q)) ? Number(params.q) : null;
  const shown = invoices.filter((i) => (status === "all" || i.status === status) && (year === "all" || yearOf(i.invoice_date) === Number(year))
    && (quarter === null || Math.floor((Number(i.invoice_date.slice(5, 7)) - 1) / 3) + 1 === quarter));
  const custName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? "—";

  const unpaid = invoices.filter((i) => i.status !== "paid");
  const owed = round2(unpaid.reduce((a, i) => a + (totals.get(i.id)?.owed ?? 0), 0));
  const owedProfit = round2(unpaid.reduce((a, i) => a + (totals.get(i.id)?.profit ?? 0), 0));

  const spend = cardSpend(invoices, lines);
  const counts: Record<string, number> = {};
  invoices.forEach((i) => { if (i.customer_id) counts[i.customer_id] = (counts[i.customer_id] ?? 0) + 1; });
  const topCustomer = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? customers.find((c) => c.name === "BWWI")?.id ?? customers[0]?.id ?? "";

  return (
    <>
      <PageHeader title="Invoices & sales" description="Drop in an invoice PDF and the items are read for you. Click an arrow to see an invoice's items and details."
        action={
          <div className="rounded-xl bg-white px-4 py-2 text-right ring-1 ring-line">
            <p className="text-sm text-muted">Customers owe you</p>
            <p className="text-xl font-extrabold">{money(owed)}</p>
            {unpaid.length > 0 && <p className="text-xs text-muted">{money(owedProfit)} profit once paid</p>}
          </div>
        } />

      {editable && (
        <InvoiceStart action={act.saveInvoiceAction} customers={customers} contractors={contractors} items={items} history={lastPrices(items, invoices, lines)}
          quarters={data.quarters} cardNames={cardNames(invoices)} today={today} startCustomerId={topCustomer} />
      )}

      {(spend.theirs > 0 || spend.mine.length > 0) && (
        <details className="card">
          <summary className="cursor-pointer font-extrabold">Card spending <span className="ml-2 text-sm font-normal text-muted">{money(spend.theirs)} on their card{spend.mine.length ? ` · ${money(round2(spend.mine.reduce((a, c) => a + c.spent, 0)))} on yours` : ""}</span></summary>
          <div className="mt-3 overflow-x-auto">
            <table className="data-table compact">
              <thead><tr><th>Card</th><th className="r">Invoices</th><th className="r">Spent on goods</th></tr></thead>
              <tbody>
                <tr><td className="font-semibold">Their card <span className="font-normal text-muted">(not owed to you)</span></td><td className="r">{invoices.filter((i) => (totals.get(i.id)?.theirCard ?? 0) > 0).length}</td><td className="r">{money(spend.theirs)}</td></tr>
                {spend.mine.map((c) => <tr key={c.name}><td className="font-semibold">{c.name}</td><td className="r">{c.invoices}</td><td className="r">{money(c.spent)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Set the amounts and card names on each invoice (Edit, then &ldquo;Which card paid for the goods&rdquo;).</p>
        </details>
      )}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2>{shown.length} {shown.length === 1 ? "invoice" : "invoices"}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar fields={[
              { name: "status", label: "Status", value: status, options: [{ value: "all", label: "All" }, { value: "unpaid", label: "Not paid" }, { value: "paid", label: "Paid" }] },
              { name: "year", label: "Year", value: year, options: [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))] },
              { name: "q", label: "Quarter", value: quarter ? String(quarter) : "all", options: [{ value: "all", label: "All quarters" }, ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `Quarter ${n}` }))] },
            ]} />
            <ExportLink kind="invoices" year={year} label="Invoices CSV" />
          </div>
        </div>

        {shown.length === 0 ? <Empty title="No invoices here yet">{editable ? "Drop one in above, or create one by hand." : "Nothing has been added yet."}</Empty> : (
          <div className="divide-y divide-line">
            {shown.map((i) => {
              const t = totals.get(i.id)!;
              const mine = lines.filter((l) => l.invoice_id === i.id).sort((a, b) => a.position - b.position);
              const worker = contractors.find((c) => c.id === i.contractor_id)?.name;
              return (
                <details key={i.id} className="group py-1">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-1 py-3 hover:bg-bg [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="text-muted transition-transform group-open:rotate-90">▶</span>
                    <span className="min-w-[5.5rem] font-extrabold">{docShort(i)}</span>
                    <span className="min-w-[8rem] flex-1">{custName(i.customer_id)}<span className="ml-2 text-xs text-muted">{sheetDate(i.invoice_date)}</span></span>
                    <span className="text-right"><span className="block text-xs text-muted">They owe you</span><span className="font-bold">{money(t.owed)}</span></span>
                    <span className="text-right"><span className="block text-xs text-muted">Profit</span><span className={`font-bold ${t.profit < 0 ? "text-bad" : "text-go"}`}>{money(t.profit)}</span></span>
                    {i.status === "paid" ? <Badge tone="green">Paid{i.paid_on ? ` ${sheetDate(i.paid_on)}` : ""}</Badge> : <Badge tone="amber">Not paid</Badge>}
                  </summary>

                  <div className="mb-3 ml-6 mt-1 space-y-3 rounded-xl bg-bg p-4">
                    <div className="overflow-x-auto">
                      <table className="data-table compact">
                        <thead><tr><th>Item</th><th>Last 4 UPC</th><th className="r">Qty</th><th className="r">Sold for</th><th className="r">Cost</th><th className="r">Profit</th><th>Card</th></tr></thead>
                        <tbody>
                          {mine.length === 0 ? <tr><td colSpan={7} className="text-muted">No items listed. The total was typed in.</td></tr> : mine.map((l) => {
                            const it = items.find((x) => x.id === l.item_id);
                            return (
                              <tr key={l.id}>
                                <td className="wrap">{it?.name ?? "—"}</td><td>{it?.upc ?? "—"}</td><td className="r">{num(l.qty)}</td>
                                <td className="r">{money(l.unit_price)}</td><td className="r">{money(l.unit_cost)}</td>
                                <td className={`r ${(l.unit_price - l.unit_cost) < 0 ? "text-bad" : ""}`}>{money(round2((l.unit_price - l.unit_cost) * l.qty))}</td>
                                <td>{l.own_card === false ? "Theirs" : "Mine"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-muted">Total they owe</dt><dd className="font-bold">{money(t.owed)}{t.tax > 0 ? ` (incl. ${money(t.tax)} tax)` : ""}</dd></div>
                      {t.theirCard > 0 && <div><dt className="text-xs text-muted">Spent on their card</dt><dd className="font-bold">{money(t.theirCard)} <span className="font-normal text-muted">(not owed to you)</span></dd></div>}
                      {t.myCard > 0 && <div><dt className="text-xs text-muted">Spent on {i.my_card?.trim() ? i.my_card.trim() : "my card"}</dt><dd className="font-bold">{money(t.myCard)}</dd></div>}
                      <div><dt className="text-xs text-muted">Cost of goods</dt><dd className="font-bold">{money(t.cogs)}</dd></div>
                      <div><dt className="text-xs text-muted">Business miles</dt><dd className="font-bold">{t.miles ? `${num(t.miles)} mi` : "none yet"}</dd></div>
                      <div><dt className="text-xs text-muted">Paid</dt><dd className="font-bold">{i.status === "paid" ? (i.paid_on ? sheetDate(i.paid_on) : "Yes") : "Not yet"}</dd></div>
                      {i.store && <div><dt className="text-xs text-muted">Bought at</dt><dd>{i.store}</dd></div>}
                      {worker && <div><dt className="text-xs text-muted">Bought by</dt><dd>{worker}</dd></div>}
                      {i.notes && <div className="col-span-2"><dt className="text-xs text-muted">Notes</dt><dd>{i.notes}</dd></div>}
                      {i.file_id && <div><dt className="text-xs text-muted">Invoice PDF</dt><dd><FileLink id={i.file_id} /></dd></div>}
                    </dl>

                    <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3">
                      <Link href={`/invoices/${i.id}`} className="btn btn-sm">{editable ? "Edit items, miles, prices" : "Open"}</Link>
                      {editable && mine.length > 0 && <CardControl id={i.id} state={mine.every((l) => l.own_card !== false) ? "mine" : mine.every((l) => l.own_card === false) ? "theirs" : "mixed"} action={act.setInvoiceCardAction} />}
                      {editable && <PaymentControl id={i.id} paid={i.status === "paid"} paidOn={i.paid_on} today={today} action={act.setInvoicePaidAction} />}
                      {editable && !lockedMessage(data.quarters, [i.invoice_date]) && <DeleteButton action={act.deleteInvoiceAction} id={i.id} confirmText={`Delete ${docShort(i)} and its ${t.count} item${t.count === 1 ? "" : "s"}?`} />}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
