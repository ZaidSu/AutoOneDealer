import ActionForm from "@/components/ui/ActionForm";
import DeleteButton from "@/components/ui/DeleteButton";
import Empty from "@/components/ui/Empty";
import FileLink from "@/components/ui/FileLink";
import FilterBar from "@/components/ui/FilterBar";
import ExportLink from "@/components/ui/ExportLink";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";
import { money, yearOf } from "@/lib/calc";


const BUSINESS: Record<string, string> = { resale: "Electronics resale", software: "Software services", shared: "Shared" };
const CATEGORIES = ["Shipping", "Packaging", "Supplies", "Software", "Advertising", "Bank and payment fees", "Mileage", "Equipment", "Contract labor", "Other"];

export default function ExpensesView({ data, params, editable, act, today, contractorId }: ViewProps) {
  const { expenses } = data;

  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([thisYear, ...expenses.map((e) => yearOf(e.spent_on))])].sort((a, b) => b - a);
  const year = params.year === "all" ? "all" : years.includes(Number(params.year)) ? String(params.year) : String(thisYear);
  const shown = expenses.filter((e) => year === "all" || yearOf(e.spent_on) === Number(year));
  const total = shown.reduce((a, e) => a + e.amount, 0);
  const byCat: Record<string, number> = {};
  shown.forEach((e) => { byCat[e.category] = (byCat[e.category] ?? 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Expenses" description="Shipping, supplies, fees and anything else it costs to run the business." />

      {editable && (
        <section className="card">
          <h2 className="mb-3">Add an expense</h2>
          <ActionForm action={act.addExpenseAction} submitLabel="Save expense">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field">Date<input name="spent_on" type="date" required className="input" defaultValue={today} /></label>
              <label className="field">Category
                <select name="category" className="input" defaultValue="Shipping">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="field">For
                <select name="business" className="input" defaultValue="resale">
                  <option value="resale">Electronics resale</option><option value="software">Software services</option><option value="shared">Shared</option>
                </select>
              </label>
              <label className="field">Vendor<input name="vendor" className="input" placeholder="UPS" /></label>
              <label className="field">Amount<input name="amount" type="number" min="0" step="0.01" required className="input" /></label>
              <label className="field sm:col-span-2">Notes<input name="notes" className="input" /></label>
              <label className="field sm:col-span-2">Receipt (PDF or photo, up to 4 MB)
                <input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" className="input !h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-1.5 file:font-semibold" />
              </label>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2>{shown.length} {shown.length === 1 ? "expense" : "expenses"} · {money(total)}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar fields={[{ name: "year", label: "Year", value: year, options: [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))] }]} />
            <ExportLink kind="expenses" year={year} />
          </div>
        </div>
        {cats.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{cats.map(([c, v]) => <span key={c} className="chip">{c} <strong className="ml-1">{money(v)}</strong></span>)}</div>}
        {shown.length === 0 ? <Empty title="No expenses here yet">{editable ? "Add one above and it appears in this list." : "Nothing has been logged yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Category</th><th>For</th><th>Vendor</th><th className="r">Amount</th><th>Receipt</th>{editable && <th />}</tr></thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    <td>{x.spent_on}</td>
                    <td>{x.category}{x.notes ? <div className="text-xs text-muted">{x.notes}</div> : null}</td>
                    <td>{BUSINESS[x.business ?? "resale"]}</td><td>{x.vendor || "\u2014"}</td><td className="r">{money(x.amount)}</td><td><FileLink id={x.receipt_file_id} /></td>
                    {editable && <td className="r"><DeleteButton action={act.deleteExpenseAction} id={x.id} confirmText={`Delete this ${money(x.amount)} ${x.category.toLowerCase()} expense?`} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
