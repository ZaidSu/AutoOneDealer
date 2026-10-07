import FilterBar from "@/components/ui/FilterBar";
import Icon from "@/components/ui/Icon";
import ExportLink from "@/components/ui/ExportLink";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";
import ActionForm from "@/components/ui/ActionForm";
import { expensesByBusiness, invoiceTotalsMap, money, num, periodSummary, perMile, QUARTERS, rateFor, repeatedTrips, round2, yearOf, DEFAULT_MILEAGE_RATE, type PeriodSummary } from "@/lib/calc";


const ROWS: { key: keyof PeriodSummary; label: string; sub?: string; strong?: boolean; miles?: boolean }[] = [
  { key: "totalSales", label: "Total sales" },
  { key: "resaleSales", label: "Resale and exempt sales", sub: "No tax charged" },
  { key: "taxableSales", label: "Taxable sales" },
  { key: "taxCollected", label: "Sales tax collected", strong: true },
  { key: "cogs", label: "Cost of goods sold" },
  { key: "grossProfit", label: "Gross profit" },
  { key: "expenses", label: "Business expenses" },
  { key: "netProfit", label: "Net profit", strong: true },
  { key: "miles", label: "Business miles", sub: "Driving to buy the goods", miles: true },
  { key: "mileageExpense", label: "Mileage expense" },
  { key: "netAfterMileage", label: "Net profit after mileage", strong: true },
];

export default function TaxesView({ data, params, editable, act, today, contractorId }: ViewProps) {
  const { expenses, customers, invoices, lines } = data;

  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([thisYear, ...invoices.map((i) => yearOf(i.invoice_date)), ...expenses.map((e) => yearOf(e.spent_on))])].sort((a, b) => b - a);
  const year = years.includes(Number(params.year)) ? Number(params.year) : thisYear;

  const rate = rateFor(data.settings, year);
  const sum = (from: string, to: string) => periodSummary({ invoices, lines, expenses, from, to, mileageRate: rate });
  const qs = QUARTERS.map((q) => ({ ...q, s: sum(`${year}-${q.from}`, `${year}-${q.to}`) }));
  const full = sum(`${year}-01-01`, `${year}-12-31`);

  // "Before you file" checks, for the selected year
  const totals = invoiceTotalsMap(invoices, lines);
  const yearInvoices = invoices.filter((i) => yearOf(i.invoice_date) === year);
  const certMissing = yearInvoices.filter((i) => i.tax_status === "resale" && !customers.find((c) => c.id === i.customer_id)?.cert_file_id);
  const certMissingTotal = round2(certMissing.reduce((a, i) => a + (totals.get(i.id)?.gross ?? 0), 0));
  const empty = yearInvoices.filter((i) => (totals.get(i.id)?.owed ?? 0) === 0);
  const taxableNoTax = yearInvoices.filter((i) => i.tax_status === "taxable" && !(i.sales_tax > 0));
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const unpaidOwed = round2(unpaid.reduce((a, i) => a + (totals.get(i.id)?.owed ?? 0), 0));
  const trips = repeatedTrips(yearInvoices);
  const plural = (n: number, w: string) => `${num(n)} ${w}${n === 1 ? "" : "s"}`;

  const checks = [
    { ok: certMissing.length === 0, good: "Every resale invoice has a resale certificate on file.", bad: `${plural(certMissing.length, "resale invoice")} (${money(certMissingTotal)}) to a customer with no resale certificate uploaded.`, href: "/customers", cta: "Open Customers" },
    { ok: empty.length === 0, good: "Every invoice has items or a total.", bad: `${plural(empty.length, "invoice")} with nothing on it ($0).`, href: "/invoices", cta: "Open Invoices" },
    { ok: taxableNoTax.length === 0, good: "Every taxable invoice has tax recorded.", bad: `${plural(taxableNoTax.length, "taxable invoice")} with $0 tax collected.`, href: "/invoices", cta: "Open Invoices" },
    { ok: trips.length === 0, good: "No store trip has its miles counted more than once.", bad: `${plural(trips.length, "store trip")} list miles on more than one invoice (${trips.slice(0, 2).map((t) => `${t.store || "a store"} on ${t.date}`).join(", ")}${trips.length > 2 ? ", ..." : ""}). If it was one trip, put the miles on just one of them.`, href: "/invoices", cta: "Open Invoices" },
    { ok: unpaid.length === 0, good: "No unpaid invoices.", bad: `${plural(unpaid.length, "unpaid invoice")} (${money(unpaidOwed)}).`, href: "/invoices", cta: "Open Invoices" },
  ];
  const byBusiness = expensesByBusiness(expenses, year);
  const noActivity = full.totalSales === 0 && full.expenses === 0;

  return (
    <>
      <PageHeader title="Taxes" description="Your numbers by quarter, ready for your sales tax filing and your accountant."
        action={<>
          <FilterBar fields={[{ name: "year", label: "Year", value: String(year), options: years.map((y) => ({ value: String(y), label: String(y) })) }]} />
          {!noActivity && (
            <>
              <ExportLink kind="taxes" year={year} label="Summary CSV" icon />
              <ExportLink kind="package" year={year} label={`Tax package ${year} (zip)`} icon />
            </>
          )}
        </>} />

      <section className="card">
        <h2 className="mb-3">Quarterly summary for {year}</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th />
                {qs.map((q) => <th key={q.label} className="r">{q.label}<div className="text-xs font-medium text-faint">{q.months}</div>{(data.quarters ?? []).some((r) => r.year === year && r.quarter === Number(q.label.slice(1))) && <div className="text-xs font-bold text-go">Finalized</div>}</th>)}
                <th className="r">Full year<div className="text-xs font-medium text-faint">{year}</div></th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key} className={r.strong ? "font-extrabold" : ""}>
                  <td>{r.label}{r.sub ? <div className="text-xs font-normal text-muted">{r.sub}</div> : null}</td>
                  {qs.map((q) => <td key={q.label} className={`r ${q.s[r.key] < 0 ? "text-bad" : ""}`}>{r.miles ? `${num(q.s[r.key])} mi` : money(q.s[r.key])}</td>)}
                  <td className={`r bg-paper font-bold ${full[r.key] < 0 ? "text-bad" : ""}`}>{r.miles ? `${num(full[r.key])} mi` : money(full[r.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Sales are what you charged before tax. Cost of goods is what you entered on each invoice. These totals organize your
          records; confirm the tax treatment with your accountant or on the Comptroller&rsquo;s return before you file.
        </p>
      </section>

      {byBusiness.some((b) => b.total > 0) && (
        <section className="card">
          <h2 className="mb-1">Expenses by part of the company, {year}</h2>
          <p className="mb-3 text-sm text-muted">Tag each expense as electronics resale, software services or shared, so your accountant can see each side on its own.</p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th /><th className="r">Q1</th><th className="r">Q2</th><th className="r">Q3</th><th className="r">Q4</th><th className="r">Full year</th></tr></thead>
              <tbody>
                {byBusiness.map((b) => (
                  <tr key={b.business}>
                    <td>{b.label}</td>{b.quarters.map((v, i) => <td key={i} className="r">{v ? money(v) : "\u2014"}</td>)}<td className="r bg-paper font-bold">{money(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editable && (
        <section className="card">
          <h2>Mileage rate for {year}</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            Now {perMile(rate)} per mile ({rate === DEFAULT_MILEAGE_RATE && !data.settings.mileageRates[String(year)] ? "the rate your sheet works out to" : "saved"}). Confirm the rate for the year with your accountant.
          </p>
          <ActionForm key={year} action={act.setMileageRateAction} submitLabel="Save rate" reset={false}>
            <input type="hidden" name="year" value={year} />
            <label className="field max-w-[220px]">Dollars per mile<input name="rate" type="number" min="0.001" max="5" step="0.001" required defaultValue={rate} className="input" /></label>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2">Before you file</h2>
        <ul>
          {checks.map((c, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-line/70 py-3 last:border-0">
              <Icon name={c.ok ? "check" : "alert"} className={`size-[18px] shrink-0 ${c.ok ? "text-go" : "text-accent-ink"}`} />
              <span className="flex-1">{c.ok ? c.good : c.bad}</span>
              {!c.ok && <a href={c.href} className="link-btn whitespace-nowrap">{c.cta}</a>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
