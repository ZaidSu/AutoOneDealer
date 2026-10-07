import LineChart, { type ChartSeries } from "@/components/charts/LineChart";
import Empty from "@/components/ui/Empty";
import FilterBar from "@/components/ui/FilterBar";
import PageHeader from "@/components/ui/PageHeader";
import PeriodTable from "@/components/ui/PeriodTable";
import StoreBadge from "@/components/ui/StoreBadge";
import {
  itemPerformance, money, monthlySales, num, periodTable, priceHistory, rateFor, sheetDate, storeSpend, yearOf,
} from "@/lib/calc";
import { storeStyle } from "@/lib/stores";
import type { ViewProps } from "./types";

const dayNumber = (d: string) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000);

export default function AnalyticsView({ data, params, today }: ViewProps) {
  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([thisYear, ...data.invoices.map((i) => yearOf(i.invoice_date))])].sort((a, b) => b - a);
  const yearParam = params.year === "all" ? "all" : years.includes(Number(params.year)) ? String(params.year) : String(thisYear);
  const year = yearParam === "all" ? null : Number(yearParam);

  // 1) sales, cost of goods and profit over time
  const months = monthlySales(data, year);
  const tipFor = (label: string, name: string, v: number) => `${label}\n${name} ${money(v)}`;
  const timeline: ChartSeries[] = [
    { name: "Gross sales", color: "#10233f", points: months.map((m, i) => ({ x: i, y: m.gross, tip: tipFor(m.label, "Gross sales", m.gross) })) },
    { name: "Cost of goods", color: "#6b7f95", points: months.map((m, i) => ({ x: i, y: m.cogs, tip: tipFor(m.label, "Cost of goods", m.cogs) })) },
    { name: "Net profit", color: "#f2a541", points: months.map((m, i) => ({ x: i, y: m.net, tip: tipFor(m.label, "Net profit", m.net) })) },
  ];
  const profitOnly = params.show === "profit";
  const shownTimeline = profitOnly ? timeline.filter((t) => t.name === "Net profit") : timeline;
  const everyOther = months.length > 14 ? Math.ceil(months.length / 12) : 1;
  const timelineTicks = months.map((m, i) => ({ x: i, label: i % everyOther === 0 ? m.label : "" }));
  const anySales = months.some((m) => m.gross || m.cogs);

  // 2) one item's prices, deal by deal
  const perf = itemPerformance(data, year);
  const itemId = data.items.some((i) => i.id === params.item) ? (params.item as string) : (perf[0]?.itemId ?? data.items[0]?.id ?? "");
  const history = itemId ? priceHistory(data, itemId) : { buy: [], sell: [] };
  const inRange = (d: string) => year === null || yearOf(d) === year;
  const buy = history.buy.filter((p) => inRange(p.date)), sell = history.sell.filter((p) => inRange(p.date));
  const itemName = data.items.find((i) => i.id === itemId)?.name ?? "";
  const dates = [...buy, ...sell].map((p) => dayNumber(p.date));
  const first = Math.min(...dates), last = Math.max(...dates);
  const tickCount = Math.min(6, new Set(dates).size);
  const priceTicks = dates.length === 0 ? [] : Array.from({ length: tickCount }, (_, i) => {
    const x = tickCount === 1 ? first : Math.round(first + ((last - first) * i) / (tickCount - 1));
    const d = new Date(x * 86400000).toISOString().slice(0, 10);
    return { x, label: sheetDate(d) };
  });
  const priceSeries: ChartSeries[] = [
    { name: "Buying price", color: "#6b7f95", points: buy.map((p) => ({ x: dayNumber(p.date), y: p.price, tip: `${num(p.qty)} × bought at ${money(p.price)}\n${sheetDate(p.date)}${p.note ? ` · ${p.note}` : ""}` })) },
    { name: "Selling price", color: "#f2a541", points: sell.map((p) => ({ x: dayNumber(p.date), y: p.price, tip: `${num(p.qty)} × sold at ${money(p.price)}\n${sheetDate(p.date)}${p.note ? ` · ${p.note}` : ""}` })) },
  ];

  // 3) tables
  const spend = storeSpend(data, year);
  const spendMax = Math.max(...spend.map((s) => s.spent), 1);
  const periods = year === null ? null : periodTable({ invoices: data.invoices, lines: data.lines, year, mileageRate: rateFor(data.settings, year) });
  const scope = year === null ? "all years" : String(year);

  return (
    <>
      <PageHeader title="Analytics" description="What sold, when, and for how much."
        action={<FilterBar fields={[{ name: "year", label: "Year", value: yearParam, options: [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))] }]} />} />

      <section className="card !p-5 sm:!p-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Sales, cost of goods and profit</h2>
            <p className="mt-1 text-sm text-muted">One circle per month, by invoice date ({scope}). Hover a circle for the amount.</p>
          </div>
          <FilterBar fields={[{ name: "show", label: "Lines", value: profitOnly ? "profit" : "all", options: [{ value: "all", label: "All three lines" }, { value: "profit", label: "Profit only" }] }]} />
        </div>
        <LineChart series={shownTimeline} xTicks={timelineTicks} ariaLabel={`Sales, cost of goods and net profit by month, ${scope}`}
          emptyText="Nothing sold yet. Drop in an invoice and the lines appear here." />
      </section>

      <section className="card !p-5 sm:!p-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Price history{itemName ? `: ${itemName}` : ""}</h2>
            <p className="mt-1 text-sm text-muted">What you paid and what it sold for, invoice by invoice ({scope}).</p>
          </div>
          {data.items.length > 0 && (
            <FilterBar fields={[{ name: "item", label: "Item", value: itemId, options: data.items.map((i) => ({ value: i.id, label: i.name })) }]} />
          )}
        </div>
        {data.items.length === 0
          ? <Empty title="No items yet">Drop in an invoice and its items appear here.</Empty>
          : <LineChart series={priceSeries} xTicks={priceTicks} ariaLabel={`Buying and selling price of ${itemName} over time`} emptyText="This item isn't on any invoice in this period." height={280} zeroBase={false} />}
      </section>

      <section className="card">
        <h2 className="mb-3">Items, {scope}</h2>
        {perf.length === 0 ? <Empty title="No sales here yet">Items appear once they&rsquo;ve sold.</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Item</th><th className="r">Sold</th><th className="r">Avg buying price</th><th className="r">Avg selling price</th><th className="r">Gross sales</th><th className="r">Cost of goods</th><th className="r">Net profit</th><th className="r">Margin</th></tr></thead>
              <tbody>
                {perf.map((p) => (
                  <tr key={p.itemId}>
                    <td>{p.name}</td><td className="r">{num(p.units)}</td><td className="r">{money(p.avgBuy)}</td><td className="r">{money(p.avgSell)}</td>
                    <td className="r">{money(p.gross)}</td><td className="r">{money(p.cogs)}</td>
                    <td className={`r font-bold ${p.net < 0 ? "text-bad" : "text-go"}`}>{money(p.net)}</td><td className="r">{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3">Where the goods came from, {scope}</h2>
        {spend.length === 0 ? <Empty title="No store recorded yet">Set the store on an invoice (under More) and it shows here.</Empty> : (
          <ul className="grid gap-3">
            {spend.map((s) => {
              const st = storeStyle(s.store);
              return (
                <li key={s.store} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[15px]">
                  <StoreBadge name={s.store === "No store" ? null : s.store} />
                  <span aria-hidden className="h-4 overflow-hidden rounded bg-paper"><span className="block h-full rounded" style={{ width: `${Math.max(3, (s.spent / spendMax) * 100)}%`, background: st?.bg ?? "#8da2b5" }} /></span>
                  <span className="font-bold tabular-nums">{money(s.spent)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1">Month by month, {year ?? "choose a year"}</h2>
        <p className="mb-3 text-sm text-muted">Invoices, sales, cost of goods and what&rsquo;s left, with a total for each quarter and the year.</p>
        {periods ? <PeriodTable rows={periods} /> : <Empty title="Pick a year above">The month-by-month table shows one year at a time.</Empty>}
      </section>
    </>
  );
}
