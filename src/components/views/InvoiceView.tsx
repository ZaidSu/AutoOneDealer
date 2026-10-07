import Link from "next/link";
import InvoiceEditor from "@/components/forms/InvoiceEditor";
import { CertUpload, PaymentControl } from "@/components/forms/RowControls";
import Badge from "@/components/ui/Badge";
import DeleteButton from "@/components/ui/DeleteButton";
import ExportLink from "@/components/ui/ExportLink";
import FileLink from "@/components/ui/FileLink";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { cardNames, docName, invoiceTotals, lastPrices, lockedMessage, sheetDate } from "@/lib/calc";
import type { ViewProps } from "./types";

export default function InvoiceView({ data, editable, act, today, invoiceId }: ViewProps) {
  const inv = data.invoices.find((i) => i.id === invoiceId);
  if (!inv) return <PageHeader title="Invoice not found" />;
  const t = invoiceTotals(inv, data.lines);
  const customer = data.customers.find((c) => c.id === inv.customer_id)?.name ?? "Customer";
  const paid = inv.status === "paid";
  const locked = lockedMessage(data.quarters, [inv.invoice_date]);

  return (
    <>
      <Link href="/invoices" className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" /> All invoices</Link>
      <PageHeader title={docName(inv)} description={`${customer} · ${sheetDate(inv.invoice_date)}${inv.kind === "po" ? " · purchase order from the customer" : ""}`}
        action={t.count > 0 ? <ExportLink kind="invoice" id={inv.id} label="Download items" icon /> : undefined} />

      <section className="card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            {paid ? <Badge tone="green">Paid{inv.paid_on ? ` ${sheetDate(inv.paid_on)}` : ""}</Badge> : <Badge tone="amber">Not paid</Badge>}
            {editable && <PaymentControl id={inv.id} paid={paid} paidOn={inv.paid_on} today={today} action={act.setInvoicePaidAction} />}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{inv.kind === "po" ? "PO PDF:" : "Invoice PDF:"}</span>
            <FileLink id={inv.file_id} label="View PDF" />
            {editable && <CertUpload customerId={inv.id} hasFile={Boolean(inv.file_id)} action={act.uploadInvoiceFileAction} field="invoice_id" />}
          </div>
          {editable && !locked && <span className="ml-auto"><DeleteButton action={act.deleteInvoiceAction} id={inv.id} confirmText={`Delete ${docName(inv)} and its ${t.count} item${t.count === 1 ? "" : "s"}?`} label="Delete" after="/invoices" /></span>}
        </div>
      </section>

        <InvoiceEditor action={act.saveInvoiceAction} customers={data.customers} contractors={data.contractors} items={data.items}
          history={lastPrices(data.items, data.invoices, data.lines)} quarters={data.quarters} cardNames={cardNames(data.invoices)} today={today} invoice={inv} lines={t.lines} readOnly={!editable} />
    </>
  );
}
