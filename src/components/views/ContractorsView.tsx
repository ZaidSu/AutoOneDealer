import Link from "next/link";
import ActionForm from "@/components/ui/ActionForm";
import DeleteButton from "@/components/ui/DeleteButton";
import Empty from "@/components/ui/Empty";
import ExportLink from "@/components/ui/ExportLink";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";
import { contractorBalances, money, num } from "@/lib/calc";


export default function ContractorsView({ data, params, editable, act, today, contractorId }: ViewProps) {
  const { contractors, invoices, lines, payments } = data;
  const balances = contractorBalances(contractors, invoices, lines, payments, data.contractor_invoices, data.contractor_lines);
  const totalOwed = Object.values(balances).reduce((a, b) => a + Math.max(b.owed, 0), 0);

  return (
    <>
      <PageHeader title="Contractors" description="People who buy for you. Add their invoices, see what each one charged and what you still owe. Kept apart from your own sales and profit."
        action={<div className="rounded-xl bg-white px-4 py-2 text-right ring-1 ring-line"><p className="text-sm text-muted">You owe contractors</p><p className="text-xl font-extrabold">{money(totalOwed)}</p></div>} />

      {editable && (
        <section className="card">
          <h2 className="mb-3">Add a contractor</h2>
          <ActionForm action={act.addContractorAction} submitLabel="Add contractor">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field">Name<input name="name" required className="input" /></label>
              <label className="field">Phone<input name="phone" type="tel" className="input" /></label>
              <label className="field">Email<input name="email" type="email" className="input" /></label>
              <label className="field">Notes<input name="notes" className="input" /></label>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3">{contractors.length} {contractors.length === 1 ? "contractor" : "contractors"}</h2>
        {contractors.length === 0 ? <Empty title="No contractors yet">{editable ? "Add one above, then open them to add their invoices." : "Nobody has been added yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Name</th><th className="r">Invoices</th><th className="r">Invoiced you</th><th className="r">Paid back</th><th className="r">You owe</th><th /></tr></thead>
              <tbody>
                {contractors.map((c) => {
                  const b = balances[c.id];
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/contractors/${c.id}`} className="link-btn">{c.name}</Link><div className="text-xs text-muted">{[c.phone, c.email].filter(Boolean).join("   ")}</div></td>
                      <td className="r">{num(b.orders)}</td><td className="r">{money(b.bought)}</td><td className="r">{money(b.paid)}</td>
                      <td className={`r font-bold ${b.owed > 0 ? "text-accent-ink" : ""}`}>{money(b.owed)}</td>
                      <td className="r"><span className="inline-flex items-center gap-4"><Link href={`/contractors/${c.id}`} className="link-btn">Open</Link>{editable && <DeleteButton action={act.deleteContractorAction} id={c.id} confirmText={`Delete ${c.name}?`} />}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
