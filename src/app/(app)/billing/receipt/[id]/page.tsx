import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintButton from "@/components/billing/PrintButton";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { getBillingSettings } from "@/lib/billing";
import { listStripeInvoices, stripeBillingOn } from "@/lib/billing/stripe-sync";
import { money, periodLabel } from "@/lib/billing/types";
import { dealership } from "@/lib/dealership";

export const metadata: Metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

/** A receipt for one paid month. Shows the business name only (no street address). */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageStaff();
  if (!can.viewBilling(staff.role) || !stripeBillingOn()) notFound();
  const { id } = await params;
  const invoice = (await listStripeInvoices().catch(() => [])).find((i) => i.stripeId === id && i.status === "paid");
  if (!invoice) notFound();
  const settings = await getBillingSettings();
  const paidOn = invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: dealership.timeZone }) : "";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href="/billing" className="panel-link">← Back to billing</a>
        <PrintButton />
      </div>
      <article className="panel p-8">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-2xl font-semibold">Receipt</h1>
            <p className="text-muted">{periodLabel(invoice.period)}</p>
          </div>
          <p className="rounded-full bg-go-soft px-3 py-1 text-sm font-semibold text-go">Paid</p>
        </header>
        <dl className="grid gap-1 py-5 text-[15px] sm:grid-cols-2">
          <div><dt className="text-muted">From</dt><dd className="font-medium">{settings.billedBy || "AutoDash"}</dd></div>
          <div><dt className="text-muted">To</dt><dd className="font-medium">{dealership.name}</dd></div>
          <div><dt className="text-muted">Receipt for bill</dt><dd className="font-medium">{invoice.number}</dd></div>
          <div><dt className="text-muted">Paid on</dt><dd className="font-medium">{paidOn}</dd></div>
        </dl>
        <ul className="divide-y divide-line border-y border-line">
          {invoice.items.map((item, n) => (
            <li key={n} className="flex items-start justify-between gap-4 py-3">
              <div><p className="font-medium">{item.label}</p>{item.detail && <p className="text-sm text-muted">{item.detail}</p>}</div>
              <p className="tabular-nums">{money(item.cents)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-1 text-[15px]">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(invoice.subtotal)}</dd></div>
          {invoice.tax > 0 && <div className="flex justify-between"><dt className="text-muted">Sales tax</dt><dd className="tabular-nums">{money(invoice.tax)}</dd></div>}
          <div className="mt-1 flex justify-between text-lg font-semibold"><dt>Amount paid</dt><dd className="tabular-nums">{money(invoice.total)}</dd></div>
        </dl>
        <p className="mt-6 text-sm text-muted">Thank you for your payment.</p>
      </article>
    </div>
  );
}
