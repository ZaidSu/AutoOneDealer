import IncomeRow from "@/components/forms/IncomeRow";
import ActionForm from "@/components/ui/ActionForm";
import Empty from "@/components/ui/Empty";
import ExportLink from "@/components/ui/ExportLink";
import FilterBar from "@/components/ui/FilterBar";
import PageHeader from "@/components/ui/PageHeader";
import { money, round2, yearOf } from "@/lib/calc";
import type { ViewProps } from "./types";

export default function IncomeView({ data, params, editable, act, today }: ViewProps) {
  const { income, projects, expenses } = data;
  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([thisYear, ...income.map((r) => yearOf(r.received_on))])].sort((a, b) => b - a);
  const year = params.year === "all" ? "all" : years.includes(Number(params.year)) ? String(params.year) : String(thisYear);
  const inYear = (d: string) => year === "all" || yearOf(d) === Number(year);

  const shown = income.filter((r) => inYear(r.received_on));
  const total = round2(shown.reduce((a, r) => a + r.amount, 0));
  const spent = round2(expenses.filter((e) => e.business === "software" && inYear(e.spent_on)).reduce((a, e) => a + e.amount, 0));

  const bySource = new Map<string, { total: number; count: number }>();
  for (const r of shown) {
    const cur = bySource.get(r.source) ?? { total: 0, count: 0 };
    bySource.set(r.source, { total: round2(cur.total + r.amount), count: cur.count + 1 });
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total);
  const known = [...new Set(income.map((r) => r.source))].sort();

  return (
    <>
      <PageHeader title="Software income" description="Money coming in from the software side: who paid you, for which project, and how much." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-muted">Income {year === "all" ? "(all years)" : `in ${year}`}</p><p className="text-2xl font-extrabold">{money(total)}</p></div>
        <div className="card"><p className="text-sm text-muted">Software expenses</p><p className="text-2xl font-extrabold">{money(spent)}</p><p className="text-xs text-muted">Marked &ldquo;Software services&rdquo; on the Expenses page</p></div>
        <div className="card"><p className="text-sm text-muted">What&rsquo;s left</p><p className={`text-2xl font-extrabold ${total - spent < 0 ? "text-bad" : "text-go"}`}>{money(round2(total - spent))}</p></div>
      </div>

      {editable && (
        <section className="card">
          <h2 className="mb-3">Add income</h2>
          <ActionForm action={act.saveIncomeAction} submitLabel="Save income">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field">Date paid<input name="received_on" type="date" required className="input" defaultValue={today} /></label>
              <label className="field">From where
                <input name="source" list="income-sources" required className="input" placeholder="Client or platform" />
                <datalist id="income-sources">{known.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label className="field">Project
                <select name="project_id" className="input" defaultValue=""><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
              <label className="field">Amount<input name="amount" type="number" min="0" step="0.01" required className="input" /></label>
              <label className="field sm:col-span-2 lg:col-span-4">Notes<input name="notes" className="input" placeholder="Optional" /></label>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2>Where it comes from</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar fields={[{ name: "year", label: "Year", value: year, options: [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))] }]} />
            <ExportLink kind="income" year={year} />
          </div>
        </div>
        {sources.length === 0 ? <Empty title="No income yet">{editable ? "Add what you were paid above." : "Nothing has been added yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>From</th><th className="r">Payments</th><th className="r">Total</th><th className="r">Share</th></tr></thead>
              <tbody>
                {sources.map(([name, v]) => (
                  <tr key={name}><td className="font-semibold">{name}</td><td className="r">{v.count}</td><td className="r font-bold">{money(v.total)}</td><td className="r">{total ? Math.round((v.total / total) * 100) : 0}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3">{shown.length} {shown.length === 1 ? "payment" : "payments"}</h2>
        {shown.length === 0 ? <Empty title="Nothing here yet" /> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th>From</th><th>Project</th><th className="r">Amount</th>{editable && <th />}</tr></thead>
              <tbody>
                {shown.map((r) => editable
                  ? <IncomeRow key={r.id} row={r} projects={projects} save={act.saveIncomeAction} remove={act.deleteIncomeAction} />
                  : (
                    <tr key={r.id}><td>{r.received_on}</td><td>{r.source}{r.notes ? <div className="text-xs text-muted">{r.notes}</div> : null}</td>
                      <td>{projects.find((p) => p.id === r.project_id)?.name ?? "—"}</td><td className="r font-bold">{money(r.amount)}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
