import Link from "next/link";
import ContractorInvoices from "@/components/forms/ContractorInvoices";
import ActionForm from "@/components/ui/ActionForm";
import DeleteButton from "@/components/ui/DeleteButton";
import Empty from "@/components/ui/Empty";
import ExportLink from "@/components/ui/ExportLink";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import { contractorBalances, docShort, legacyContractorInvoices, money, num, sheetDate } from "@/lib/calc";
import type { ViewProps } from "./types";

export default function ContractorView({ data, params, editable, act, today, contractorId }: ViewProps) {
  const { contractors, invoices, lines, payments } = data;
  const c = contractors.find((x) => x.id === contractorId);
  if (!c) return <PageHeader title="Contractor not found" />;
  const bal = contractorBalances(contractors, invoices, lines, payments, data.contractor_invoices, data.contractor_lines)[c.id];
  const older = legacyContractorInvoices(c.id, invoices, lines);
  const paid = payments.filter((p) => p.contractor_id === c.id);
  const first = c.name.split(" ")[0];
  const myInvoices = data.contractor_invoices.filter((i) => i.contractor_id === c.id);
  const myIds = new Set(myInvoices.map((i) => i.id));

  return (
    <>
      <Link href="/contractors" className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" /> All contractors</Link>
      <PageHeader title={c.name} description={[c.phone, c.email].filter(Boolean).join("  \u00b7  ") || "Contractor"}
        action={<ExportLink kind="contractor" id={c.id} label="Download statement" icon />} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`${first} has invoiced you`} value={money(bal.bought)} sub={`${num(bal.orders)} ${bal.orders === 1 ? "invoice" : "invoices"} · ${first} paid ${money(bal.spent)}, makes ${money(bal.profit)}`} />
        <Stat label="Paid back" value={money(bal.paid)} />
        <Stat label="You owe" value={money(bal.owed)} strong bad={bal.owed < 0} sub={bal.owed < 0 ? `You\u2019ve paid ${money(-bal.owed)} more than they invoiced` : undefined} />
      </div>

      <ContractorInvoices contractorId={c.id} first={first} invoices={myInvoices} lines={data.contractor_lines.filter((l) => myIds.has(l.invoice_id))} items={data.items}
        today={today} editable={editable} save={act.saveContractorInvoiceAction} remove={act.deleteContractorInvoiceAction} />

      {older.length > 0 && (
        <section className="card">
          <h2 className="mb-1">Older invoices of yours marked as bought by {first}</h2>
          <p className="mb-3 text-sm text-muted">These were marked this way before contractors had their own invoices. Their cost of goods still counts in what you owe {first}.</p>
          <div className="overflow-x-auto">
            <table className="data-table compact">
              <thead><tr><th>Invoice</th><th>Date</th><th className="r">Items</th><th className="r">Cost of goods</th></tr></thead>
              <tbody>
                {older.map((x) => (
                  <tr key={x.invoice.id}><td><Link href={`/invoices/${x.invoice.id}`} className="link-btn">{docShort(x.invoice)}</Link></td><td>{sheetDate(x.invoice.invoice_date)}</td><td className="r">{num(x.units)}</td><td className="r">{money(x.cogs)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editable && (
        <section className="card">
          <h2 className="mb-3">Record a payment to {first}</h2>
          <ActionForm action={act.addPaymentAction} submitLabel="Save payment">
            <input type="hidden" name="contractor_id" value={c.id} />
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field">Amount<input name="amount" type="number" min="0.01" step="0.01" required className="input" /></label>
              <label className="field">Date<input name="paid_on" type="date" required className="input" defaultValue={today} /></label>
              <label className="field">Method<input name="method" className="input" placeholder="Zelle, cash, check" /></label>
              <label className="field">Reference #<input name="reference" className="input" /></label>
              <label className="field sm:col-span-2">Notes<input name="notes" className="input" /></label>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3">Payments to {first}</h2>
        {paid.length === 0 ? <Empty title="No payments yet">{editable ? `Record one above when you pay ${first} back.` : "Nothing has been paid yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Date</th><th className="r">Amount</th><th>Method</th><th>Reference</th>{editable && <th />}</tr></thead>
              <tbody>
                {paid.map((p) => (
                  <tr key={p.id}>
                    <td>{sheetDate(p.paid_on)}</td><td className="r">{money(p.amount)}</td><td>{p.method || "\u2014"}</td><td>{p.reference || "\u2014"}</td>
                    {editable && <td className="r"><DeleteButton action={act.deletePaymentAction} id={p.id} confirmText={`Delete this ${money(p.amount)} payment?`} /></td>}
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
