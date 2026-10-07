import { CertUpload, CustomerTaxSelect } from "@/components/forms/RowControls";
import ActionForm from "@/components/ui/ActionForm";
import Badge from "@/components/ui/Badge";
import DeleteButton from "@/components/ui/DeleteButton";
import Empty from "@/components/ui/Empty";
import FileLink from "@/components/ui/FileLink";
import Icon from "@/components/ui/Icon";
import ExportLink from "@/components/ui/ExportLink";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";
import { invoiceTotalsMap, money, round2, TAX_LABEL } from "@/lib/calc";


export default function CustomersView({ data, params, editable, act, today, contractorId }: ViewProps) {
  const { customers, invoices, lines } = data;
  const totals = invoiceTotalsMap(invoices, lines);

  return (
    <>
      <PageHeader title="Customers" description="Who you sell to, how their sales are usually taxed, and their resale certificate." />

      {editable && (
        <section className="card">
          <h2 className="mb-3">Add a customer</h2>
          <ActionForm action={act.addCustomerAction} submitLabel="Add customer">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field">Name<input name="name" required className="input" /></label>
              <label className="field">Usually
                <select name="default_tax_status" className="input" defaultValue="resale">
                  <option value="resale">Resale (no tax)</option><option value="exempt">Exempt (no tax)</option><option value="taxable">Taxable</option>
                </select>
              </label>
              <label className="field sm:col-span-2">Notes<input name="notes" className="input" /></label>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3">{customers.length} {customers.length === 1 ? "customer" : "customers"}</h2>
        {customers.length === 0 ? <Empty title="No customers yet">{editable ? "Add who you sell to above." : "Nobody has been added yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Usually</th><th>Resale certificate</th><th className="r">Total sales</th><th className="r">Owes you</th>{editable && <th />}</tr></thead>
              <tbody>
                {customers.map((c) => {
                  const mine = invoices.filter((i) => i.customer_id === c.id);
                  const total = round2(mine.reduce((a, i) => a + (totals.get(i.id)?.gross ?? 0), 0));
                  const owes = round2(mine.filter((i) => i.status !== "paid").reduce((a, i) => a + (totals.get(i.id)?.owed ?? 0), 0));
                  return (
                    <tr key={c.id}>
                      <td>{c.name}{c.notes ? <div className="text-xs text-muted">{c.notes}</div> : null}</td>
                      <td>{editable ? <CustomerTaxSelect id={c.id} value={c.default_tax_status} name={c.name} action={act.setCustomerTaxAction} /> : TAX_LABEL[c.default_tax_status]}</td>
                      <td>
                        <span className="inline-flex items-center gap-3">
                          {c.cert_file_id
                            ? <><Badge tone="green"><Icon name="check" className="size-3" /> On file</Badge><FileLink id={c.cert_file_id} /></>
                            : <Badge tone={c.default_tax_status === "resale" ? "amber" : "plain"}>{c.default_tax_status === "resale" ? "Missing" : "Not needed"}</Badge>}
                          {editable && <CertUpload customerId={c.id} hasFile={Boolean(c.cert_file_id)} action={act.uploadCertificateAction} />}
                        </span>
                      </td>
                      <td className="r">{money(total)}</td>
                      <td className={`r font-bold ${owes > 0 ? "text-accent-ink" : ""}`}>{money(owes)}</td>
                      {editable && <td className="r"><DeleteButton action={act.deleteCustomerAction} id={c.id} confirmText={`Delete ${c.name}?`} /></td>}
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
