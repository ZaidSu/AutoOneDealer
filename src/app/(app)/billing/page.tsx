import type { Metadata } from "next";
import BillingSettingsForm from "@/components/billing/BillingSettingsForm";
import { CreateBillButton, DisconnectBankButton, RetryBankButton, VoidBillButton } from "@/components/billing/DeveloperButtons";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { draftItems, getBankMandate, getBillingSettings, isOverdue, listInvoices, periodOf, usageFor } from "@/lib/billing";
import { gocardlessConfigured, gocardlessSandbox } from "@/lib/billing/gocardless";
import { stripeConfigured, stripeTestMode } from "@/lib/billing/stripe";
import { money, periodLabel, totals, type Invoice } from "@/lib/billing/types";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const date = (d: string | number) => new Date(typeof d === "string" ? `${d}T12:00:00Z` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requirePageStaff();
  const params = await searchParams;
  const header = <PageHeader title="Billing" description="Your AutoDash plan, this month's bill, what's included, and past payments." />;
  if (!can.viewBilling(staff.role)) return <>{header}<p className="panel max-w-2xl p-5 text-muted">Only the dealership owner can see billing.</p></>;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Billing" /></>;

  const period = periodOf();
  const [settings, invoices, usage, mandate] = await fresh("Billing", () => Promise.all([getBillingSettings(), listInvoices(), usageFor(period), getBankMandate().catch(() => null)]));
  const bankReady = gocardlessConfigured();
  const current = invoices.find((i) => i.period === period) ?? null;
  const unpaid = invoices.filter((i) => i.status === "open");
  const manage = can.manageBilling(staff.role);
  // Before this month's bill exists, show what it will be.
  const previewItems = current ? null : await fresh("Bill preview", () => draftItems(period, settings));
  const preview = previewItems ? { items: previewItems, ...totals(previewItems, settings) } : null;
  const notice = params.bank === "connected" ? { ok: true, text: "Bank account connected. Bills will be paid from it automatically on their due date." }
    : params.error === "bank" || params.error === "bank_setup" ? { ok: false, text: "The bank connection didn't finish. Nothing was charged. Try again in a minute." }
    : params.paid ? { ok: true, text: "Payment received. Thank you!" }
    : params.pending ? { ok: true, text: "Payment is processing. It will show as paid in a minute." }
    : params.canceled ? { ok: false, text: "Payment canceled. Nothing was charged." }
    : params.error ? { ok: false, text: params.error === "stripe" ? "Couldn't open the payment page. Try again in a minute." : "That bill can't be paid right now." } : null;

  return (
    <div className="max-w-5xl">
      {header}
      {notice && <p role={notice.ok ? "status" : "alert"} className={`mb-6 rounded-xl px-4 py-3 text-[15px] ${notice.ok ? "bg-go-soft text-go" : "border border-signal/25 bg-warn-soft"}`}>{notice.text}</p>}
      {(stripeTestMode() || gocardlessSandbox()) && <p className="mb-6 rounded-xl border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-sm"><b>Test mode.</b> Payments use test cards and test bank accounts; no real money moves.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {/* This month's bill */}
        <section aria-labelledby="bill" className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-2">
            <div>
              <h2 id="bill" className="text-[17px] font-semibold">{periodLabel(period)} bill</h2>
              <p className="text-sm text-muted">{current ? `${current.number}, due ${date(current.dueDate)}` : "Not created yet. Here's what it will be."}</p>
            </div>
            {current && <StatusChip invoice={current} />}
          </div>
          <Breakdown items={(current ?? preview)!.items} subtotal={(current ?? preview)!.subtotal} tax={(current ?? preview)!.tax} total={(current ?? preview)!.total}
            taxNote={`Sales tax: ${settings.taxRatePercent}% on ${settings.taxablePercent}% of the bill`} />
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-5">
            {current?.status === "processing" && <p className="text-[15px]"><span className="font-semibold">Paying from your bank account.</span> <span className="text-muted">{current.note ?? "It shows as paid once the bank confirms, usually within a few business days."}</span></p>}
            {current?.status === "open" && current.note && <p className="w-full text-sm text-signal">{current.note}</p>}
            {current?.status === "open" && (
              mandate ? <RetryBankButton id={current.id} />
              : bankReady || stripeConfigured() ? (
                <div className="flex flex-wrap items-center gap-3">
                  {bankReady && (
                    <form action="/api/billing/gocardless/setup" method="post">
                      <button type="submit" className="btn btn-red h-11 px-6 text-base">Pay {money(current.total)} by bank</button>
                    </form>
                  )}
                  {stripeConfigured() && (
                    <form action="/api/billing/checkout" method="post">
                      <input type="hidden" name="invoiceId" value={current.id} />
                      <button type="submit" className={`btn h-11 px-6 text-base ${bankReady ? "" : "btn-red"}`}>{bankReady ? "Pay with card instead" : `Pay ${money(current.total)} with card`}</button>
                    </form>
                  )}
                  {bankReady && <p className="w-full text-sm text-muted">Paying by bank connects your account once; after that each month&apos;s bill is paid automatically on the {ordinal(settings.dueDay)}.</p>}
                </div>
              ) : <p className="text-sm text-muted">Online payment isn&apos;t set up yet.</p>
            )}
            {current?.status === "paid" && <p className="text-go">Paid {current.paidAt ? date(current.paidAt) : ""}. Thank you!</p>}
            {!current && manage && <CreateBillButton />}
            {!current && !manage && <p className="text-sm text-muted">Your bill for {periodLabel(period)} will appear here.</p>}
            {current?.status === "open" && manage && <VoidBillButton id={current.id} />}
          </div>
        </section>

        {/* Plan and usage */}
        <div className="grid gap-6">
          <section aria-labelledby="plan" className="panel p-5">
            <h2 id="plan" className="text-[17px] font-semibold">Your plan</h2>
            <p className="mt-2 font-condensed text-4xl font-semibold">{money(settings.monthlyCents)}<span className="font-sans text-base font-normal text-muted"> a month, plus tax</span></p>
            <p className="mt-2 text-sm text-muted">Billed by {settings.billedBy || "AutoDash"} on the {ordinal(settings.dueDay)} of each month.</p>
            {settings.planParts.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-muted">What your {money(settings.monthlyCents)} covers</h3>
                <ul className="mt-1 divide-y divide-line">
                  {settings.planParts.map((p) => (
                    <li key={p.label} className="flex items-start justify-between gap-4 py-2.5">
                      <div><p className="font-medium">{p.label}</p>{p.detail && <p className="text-sm text-muted">{p.detail}</p>}</div>
                      <p className="shrink-0 tabular-nums">{money(p.cents)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {bankReady && (
            <section aria-labelledby="paying" className="panel p-5">
              <h2 id="paying" className="text-[17px] font-semibold">How you pay</h2>
              {mandate ? (
                <>
                  <p className="mt-2 flex items-center gap-2 text-[15px]"><span aria-hidden className="size-2.5 rounded-full bg-go" />Bank account connected (ACH). Bills are paid automatically on the {ordinal(settings.dueDay)}.</p>
                  <div className="mt-3"><DisconnectBankButton /></div>
                </>
              ) : (
                <p className="mt-2 text-[15px] text-muted">No bank account connected yet. Pay a bill by bank once and the next ones are paid automatically.</p>
              )}
            </section>
          )}

          <section aria-labelledby="usage" className="panel p-5">
            <h2 id="usage" className="text-[17px] font-semibold">Used this month</h2>
            <Usage label="AI emails sent" used={usage.emails} included={settings.includedEmails} range={settings.emailRange} extra={settings.extraEmailCents} />
            <Usage label="AI texts sent" used={usage.texts} included={settings.includedTexts} range={settings.textRange} extra={settings.extraTextCents} />
          </section>
        </div>
      </div>

      {unpaid.filter((i) => i.period !== period).length > 0 && (
        <p role="alert" className="mt-6 rounded-xl border border-signal/25 bg-warn-soft px-4 py-3 text-[15px]">
          <b>Unpaid earlier bill{unpaid.length > 2 ? "s" : ""}:</b> {unpaid.filter((i) => i.period !== period).map((i) => `${periodLabel(i.period)} (${money(i.total)})`).join(", ")}. You can pay each one below.
        </p>
      )}

      <section aria-labelledby="history" className="mt-8">
        <h2 id="history" className="mb-3 text-lg font-semibold">Bills</h2>
        {invoices.length === 0 ? <p className="panel p-5 text-muted">No bills yet.</p> : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="text-sm text-muted"><tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Month</th><th className="px-3 py-3 font-medium">Bill</th><th className="px-3 py-3 font-medium">Total</th><th className="px-3 py-3 font-medium">Status</th><th className="px-5 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3 font-medium">{periodLabel(i.period)}</td>
                    <td className="px-3 py-3 text-muted">{i.number}</td>
                    <td className="px-3 py-3 tabular-nums">{money(i.total)}</td>
                    <td className="px-3 py-3"><StatusChip invoice={i} /></td>
                    <td className="px-5 py-3 text-right">
                      {i.status === "processing" && <span className="text-sm text-muted">{i.note ?? "Paying from bank"}</span>}
                      {i.status === "open" && !mandate && stripeConfigured() && (
                        <form action="/api/billing/checkout" method="post"><input type="hidden" name="invoiceId" value={i.id} /><button className="btn btn-sm">Pay</button></form>
                      )}
                      {i.status === "paid" && <span className="text-sm text-muted">Paid {i.paidAt ? date(i.paidAt) : ""}{i.method === "bank" ? " by bank" : i.method === "card" ? " by card" : ""}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="docs" className="mt-8">
        <h2 id="docs" className="mb-3 text-lg font-semibold">Documents</h2>
        {settings.documents.length === 0 ? <p className="panel p-5 text-muted">No documents yet. Your service agreement and terms will be here.</p> : (
          <ul className="panel divide-y divide-line">
            {settings.documents.map((d) => (
              <li key={d.url} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="font-medium">{d.title}</span>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="panel-link">Open</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manage && (
        <section aria-labelledby="prices" className="mt-10">
          <h2 id="prices" className="text-lg font-semibold">Prices and settings <span className="text-sm font-normal text-muted">(only you, the developer, see this)</span></h2>
          <p className="mb-3 text-sm text-muted">Changes apply to the next bill. To change a bill already created and unpaid, cancel it and create it again.</p>
          <BillingSettingsForm initial={settings} />
        </section>
      )}
    </div>
  );
}

const ordinal = (n: number) => `${n}${[, "st", "nd", "rd"][n % 100 >> 3 ^ 1 && n % 10] || "th"}`;

function Breakdown({ items, subtotal, tax, total, taxNote }: { items: Invoice["items"]; subtotal: number; tax: number; total: number; taxNote: string }) {
  return (
    <div className="px-5 pb-4">
      <ul className="divide-y divide-line">
        {items.map((item, n) => (
          <li key={n} className="flex items-start justify-between gap-4 py-3">
            <div><p className="font-medium">{item.label}</p>{item.detail && <p className="text-sm text-muted">{item.detail}</p>}</div>
            <p className="tabular-nums">{money(item.cents)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-1 grid gap-1 border-t border-line pt-3 text-[15px]">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{taxNote}</dt><dd className="tabular-nums">{money(tax)}</dd></div>
        <div className="mt-1 flex justify-between text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(total)}</dd></div>
      </dl>
    </div>
  );
}

function Usage({ label, used, included, range, extra, note }: { label: string; used: number; included: number; range: string; extra: number; note?: string }) {
  const pct = included ? Math.min(100, (used / included) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{label}</p>
        <p className="tabular-nums"><b>{used.toLocaleString()}</b> <span className="text-muted">of {included.toLocaleString()} included</span></p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper" aria-hidden><div className={`h-full rounded-full ${pct >= 90 ? "bg-signal" : "bg-go"}`} style={{ width: `${Math.max(pct, used ? 2 : 0)}%` }} /></div>
      <p className="mt-1.5 text-sm text-muted">
        {note ? `${note} ` : ""}A normal month is about {range || "n/a"}. Past the included amount, each is {money(extra)}.
      </p>
    </div>
  );
}

function StatusChip({ invoice }: { invoice: Invoice }) {
  const overdue = isOverdue(invoice);
  const [label, cls] = invoice.status === "paid" ? ["Paid", "bg-go-soft text-go"] : invoice.status === "processing" ? ["Processing", "bg-[#e7f0ff] text-[#1c56c4]"] : overdue ? ["Overdue", "bg-signal text-white"] : ["Due", "bg-warn-soft text-signal"];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
