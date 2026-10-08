import { NextResponse } from "next/server";
import { can } from "@/lib/auth/access";
import { getStaffSession } from "@/lib/auth/session";
import { getBillingSettings, listInvoices } from "@/lib/billing";
import { receiptPdf } from "@/lib/billing/receipt-pdf";
import { money, periodLabel } from "@/lib/billing/types";
import { dealership } from "@/lib/dealership";

export const dynamic = "force-dynamic";

/** The receipt for one paid month as a PDF that opens in the browser's own viewer (the link opens it in a new tab). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession();
  if (!staff || !can.viewBilling(staff.role)) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const invoice = (await listInvoices().catch(() => [])).find((i) => (i.stripeId ?? String(i.id)) === id && i.status === "paid");
  if (!invoice) return new NextResponse("Not found", { status: 404 });
  const settings = await getBillingSettings();
  const paidOn = invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: dealership.timeZone }) : "";
  const pdf = receiptPdf({
    month: periodLabel(invoice.period), from: settings.billedBy || "AutoDash", to: dealership.name, billNumber: invoice.number, paidOn,
    items: invoice.items.map((i) => ({ label: i.label, detail: i.detail || undefined, amount: money(i.cents) })),
    subtotal: money(invoice.subtotal), tax: invoice.tax > 0 ? money(invoice.tax) : undefined, total: money(invoice.total),
  });
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="receipt-${invoice.period}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
