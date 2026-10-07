import Link from "next/link";
import { FinalizePanel, ReopenButton } from "@/components/forms/QuarterControls";
import Badge from "@/components/ui/Badge";
import ExportLink from "@/components/ui/ExportLink";
import FilterBar from "@/components/ui/FilterBar";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { money, num, quarterBounds, quarterChecks, quarterLabel, quarterState, quarterSummary, sheetDate, QUARTERS, yearOf } from "@/lib/calc";
import type { ViewProps } from "./types";

export default function QuartersView({ data, params, editable, act, today }: ViewProps) {
  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([thisYear, ...data.expenses.map((e) => yearOf(e.spent_on)), ...data.invoices.map((i) => yearOf(i.invoice_date)), ...(data.quarters ?? []).map((q) => q.year)])].sort((a, b) => b - a);
  const year = years.includes(Number(params.year)) ? Number(params.year) : thisYear;

  return (
    <>
      <PageHeader title="Quarters" description="Each quarter keeps its invoices and purchase orders. Past quarters stay editable until you finalize them."
        action={<FilterBar fields={[{ name: "year", label: "Year", value: String(year), options: years.map((y) => ({ value: String(y), label: String(y) })) }]} />} />

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {[1, 2, 3, 4].map((q) => {
          const st = quarterState(year, q, today, data.quarters);
          const sum = quarterSummary(data, year, q);
          const rec = (data.quarters ?? []).find((r) => r.year === year && r.quarter === q);
          const { from, to } = quarterBounds(year, q);
          const label = quarterLabel(year, q);
          const checks = quarterChecks(data, year, q);
          const attention = checks.filter((c) => !c.ok).length;
          const s = sum.summary;
          // A past quarter with nothing in it needs no warning and nothing to finalize.
          const empty = !rec && st.state === "ended" && !sum.activity;
          const badge = empty ? <Badge>No activity</Badge> : st.state === "finalized" ? <Badge tone="green"><Icon name="lock" className="size-3" /> Finalized {rec ? sheetDate(rec.finalized_at.slice(0, 10)) : ""}</Badge>
            : st.state === "ended" ? <Badge tone="amber">Ended {st.daysAgo === 1 ? "yesterday" : `${st.daysAgo} days ago`} · not finalized</Badge>
            : st.state === "closing" ? <Badge tone="amber">{st.daysLeft === 0 ? "Closes today" : st.daysLeft === 1 ? "Closes tomorrow" : `Closes in ${st.daysLeft} days`}</Badge>
            : st.state === "open" ? <Badge>Open · {st.daysLeft} days left</Badge>
            : <Badge>Not started</Badge>;
          // A drift between the saved totals and today's would mean something changed after finalizing; say so.
          const drift = rec && Math.abs((rec.snapshot?.totalSales ?? 0) - s.totalSales) > 0.005;
          return (
            <section key={q} className={`card ${st.state === "finalized" ? "!border-go/40" : ""}`} aria-label={label}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="!mb-0.5">Quarter {q}</h2>
                  <p className="text-sm text-muted">{QUARTERS[q - 1].months} {year} · {sheetDate(from)} to {sheetDate(to)}</p>
                </div>
                {badge}
              </div>

              {st.state === "upcoming" ? <p className="mt-4 text-sm text-muted">This quarter hasn&rsquo;t started yet.</p> : empty ? <p className="mt-4 text-sm text-muted">Nothing was recorded in this quarter.</p> : (
                <>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <div><dt className="text-sm text-muted">Sales</dt><dd className="text-lg font-extrabold tabular-nums">{money(s.totalSales)}</dd></div>
                    <div><dt className="text-sm text-muted">Cost of goods</dt><dd className="text-lg font-extrabold tabular-nums">{money(s.cogs)}</dd></div>
                    <div><dt className="text-sm text-muted">Net profit</dt><dd className={`text-lg font-extrabold tabular-nums ${s.netProfit < 0 ? "text-bad" : "text-go"}`}>{money(s.netProfit)}</dd></div>
                    <div><dt className="text-sm text-muted">Expenses</dt><dd className="font-bold tabular-nums">{money(s.expenses)}</dd></div>
                    <div><dt className="text-sm text-muted">Miles</dt><dd className="font-bold tabular-nums">{num(s.miles)} · {money(s.mileageExpense)}</dd></div>
                    <div><dt className="text-sm text-muted">Items sold</dt><dd className="font-bold tabular-nums">{num(sum.itemsSold)}</dd></div>
                  </dl>
                  <p className="mt-3 text-sm text-muted">
                    {sum.invoices === 0 ? "No invoices or purchase orders yet." : <>
                      {sum.invoices} {sum.invoices === 1 ? "invoice or PO" : "invoices and POs"}
                      {sum.unpaid > 0 ? <> · <strong className="text-accent-ink">{sum.unpaid} not paid ({money(sum.unpaidOwed)})</strong></> : <> · <strong className="text-go">all paid</strong></>}
                    </>}
                  </p>
                </>
              )}

              {rec && (
                <div className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm">
                  <p className="font-bold">Saved when finalized</p>
                  <p className="mt-0.5 text-muted">
                    Sales {money(rec.snapshot?.totalSales)} · cost of goods {money(rec.snapshot?.cogs)} · net profit {money(rec.snapshot?.netProfit)} · {num(rec.snapshot?.miles)} miles
                  </p>
                  {rec.note && <p className="mt-1">&ldquo;{rec.note}&rdquo;</p>}
                  {drift && <p className="mt-1 font-semibold text-accent-ink">The figures above no longer match what was saved. Reopen and finalize again to update it.</p>}
                </div>
              )}

              {!rec && (st.state === "closing" || st.state === "ended") && attention > 0 && (
                <p className="mt-3 text-sm font-semibold text-accent-ink">{attention} thing{attention === 1 ? "" : "s"} to look at before you finalize.</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {st.state !== "upcoming" && !empty && <Link href={`/invoices?year=${year}&q=${q}`} className="btn btn-sm">Open invoices</Link>}
                {st.state !== "upcoming" && !empty && <ExportLink kind="items" year={year} id={String(q)} label="Download items CSV" />}
                {editable && rec && <ReopenButton year={year} quarter={q} label={label} action={act.reopenQuarterAction} />}
              </div>

              {editable && !rec && st.state !== "upcoming" && !empty && (
                <div className="mt-3">
                  {st.canFinalize
                    ? <FinalizePanel year={year} quarter={q} label={label} checks={checks} action={act.finalizeQuarterAction} />
                    : <p className="text-sm text-muted">You can finalize this quarter on {sheetDate(to)}, its last day.</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
