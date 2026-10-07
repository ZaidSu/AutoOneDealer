import YearChart from "@/components/dashboard/YearChart";
import Empty from "@/components/ui/Empty";
import FilterBar from "@/components/ui/FilterBar";
import ExportLink from "@/components/ui/ExportLink";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";
import Stat from "@/components/ui/Stat";
import { PaymentControl } from "@/components/forms/RowControls";
import { contractorBalances, docShort, invoiceTotalsMap, money, num, round2, sheetDate, yearOf, yearSummary } from "@/lib/calc";


export default function DashboardView({ data, params, editable, act, today, contractorId }: ViewProps) {
  const { items, expenses, contractors, payments, invoices, lines } = data;

  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([thisYear, ...invoices.map((i) => yearOf(i.invoice_date)), ...expenses.map((e) => yearOf(e.spent_on))])].sort((a, b) => b - a);
  const year = years.includes(Number(params.year)) ? Number(params.year) : thisYear;
  const itemId = items.some((i) => i.id === params.item) ? (params.item as string) : "";

  const sum = yearSummary({ invoices, lines, expenses, year, itemId: itemId || undefined });
  const { totals, perItem } = sum;
  const owedToContractors = Object.values(contractorBalances(contractors, invoices, lines, payments, data.contractor_invoices, data.contractor_lines)).reduce((a, b) => a + Math.max(b.owed, 0), 0);
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const unpaidTotals = invoiceTotalsMap(unpaid, lines);
  const owed = round2(unpaid.reduce((a, i) => a + (unpaidTotals.get(i.id)?.owed ?? 0), 0));
  const allTotals = invoiceTotalsMap(invoices, lines);
  const collected = round2(invoices.filter((i) => i.status === "paid" && i.paid_on && yearOf(i.paid_on) === year).reduce((a, i) => a + (allTotals.get(i.id)?.owed ?? 0), 0));
  const waiting = [...unpaid].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
  const daysAgo = (d: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));
  const custName = (id: string | null) => data.customers.find((c) => c.id === id)?.name ?? "\u2014";
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? "Unknown";
  const rows = Object.entries(perItem).map(([id, r]) => ({ id, name: nameOf(id), ...r, profit: r.revenue - r.cost })).sort((a, b) => b.profit - a.profit);

  return (
    <>
      <PageHeader
        title={`${year} at a glance`} description="How the year is going, month by month."
        action={<FilterBar fields={[
          { name: "year", label: "Year", value: String(year), options: years.map((y) => ({ value: String(y), label: String(y) })) },
          { name: "item", label: "Item", value: itemId, options: [{ value: "", label: "All items" }, ...items.map((i) => ({ value: i.id, label: i.name }))] },
        ]} />}
      />

      <YearChart months={sum.months} year={year} scope={itemId ? ` on ${nameOf(itemId)}` : ""} totals={{ profit: totals.profit, revenue: totals.revenue, sold: totals.sold }} />

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-muted">{year} totals</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Sales" value={money(totals.revenue)} />
          <Stat label="Gross profit" value={money(totals.profit)} />
          <Stat label="Expenses" value={totals.expenses === null ? "\u2014" : money(totals.expenses)} sub={totals.expenses === null ? "Shown for all items" : undefined} />
          <Stat label="Net profit" value={totals.net === null ? "\u2014" : money(totals.net)} bad={totals.net !== null && totals.net < 0} strong />
          <Stat label="Sales tax collected" value={money(totals.tax)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-muted">Right now</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Customers owe you" value={money(owed)} sub={unpaid.length ? `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}` : "All invoices paid"} href="/invoices" />
          <Stat label={`Collected in ${year}`} value={money(collected)} sub="Invoices you confirmed paid" />
          <Stat label="You owe contractors" value={money(owedToContractors)} href="/contractors" />
        </div>
      </section>

      {waiting.length > 0 && (
        <section className="card">
          <h2 className="mb-1">Waiting on payment</h2>
          <p className="mb-3 text-sm text-muted">When the money arrives, pick the day and confirm it. It moves out of this list and into &ldquo;Collected&rdquo;.</p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Dated</th><th className="r">They owe you</th><th>Waiting</th>{editable && <th />}</tr></thead>
              <tbody>
                {waiting.map((i) => (
                  <tr key={i.id}>
                    <td><a href={`/invoices/${i.id}`} className="link-btn">{docShort(i)}</a></td><td>{custName(i.customer_id)}</td><td>{sheetDate(i.invoice_date)}</td>
                    <td className="r font-bold">{money(allTotals.get(i.id)?.owed ?? 0)}</td>
                    <td>{daysAgo(i.invoice_date)} days</td>
                    {editable && <td className="r"><PaymentControl id={i.id} paid={false} paidOn={null} today={today} action={act.setInvoicePaidAction} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3">Items in {year}</h2>
        {items.length === 0 ? (
          <Empty title="No items yet">Drop your first invoice on the <a className="link-btn" href="/invoices">Invoices</a> page and its items appear here.</Empty>
        ) : rows.length === 0 ? (
          <Empty title={`No activity in ${year}`}>Items on your {year} invoices show up here.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Item</th><th className="r">Sold</th><th className="r">Avg buying price</th><th className="r">Sales</th><th className="r">Profit</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td><td className="r">{num(r.sold)}</td><td className="r">{r.sold ? money(r.cost / r.sold) : "\u2014"}</td>
                    <td className="r">{money(r.revenue)}</td>
                    <td className={`r font-bold ${r.profit < 0 ? "text-bad" : "text-go"}`}>{money(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Cost of goods is what you entered on each invoice.</p>
      </section>
    </>
  );
}
