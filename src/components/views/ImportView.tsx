import Link from "next/link";
import ImportBatch from "@/components/forms/ImportBatch";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";

export default function ImportView({ data, editable, act }: ViewProps) {
  return (
    <>
      <PageHeader title="Import a batch" description="Add many invoices at once, each with its PDF attached. Anything already in the app is not added twice; only its paid / not paid status is brought in line with the file, so it is safe to run again."
        action={<Link href="/invoices" className="btn btn-sm">Back to invoices</Link>} />
      {editable
        ? <ImportBatch action={act.saveInvoiceAction} payAction={act.setInvoicePaidAction} customers={data.customers} existing={data.invoices.map((i) => ({ id: i.id, kind: i.kind, no: i.invoice_no, status: i.status }))} />
        : <p className="card">Only the owner can import.</p>}
    </>
  );
}
