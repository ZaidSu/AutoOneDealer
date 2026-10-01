import type { Metadata } from "next";
import BillingSettingsForm from "@/components/billing/BillingSettingsForm";
import AcceptAgreement from "@/components/legal/AcceptAgreement";
import { getAcceptance, isCurrent } from "@/lib/legal/accept";
import { CreateBillButton, DisconnectBankButton, RetryBankButton, TurnOffAutopayButton, VoidBillButton } from "@/components/billing/DeveloperButtons";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import {
  billingStarted, billingStartProblem, billTone, draftItems, ensureInvoice, getBankMandate, getBillingSettings, getCardAutopay, listInvoices, periodOf, usageFor,
  type BillTone,
} from "@/lib/billing";
import { gocardlessConfigured, gocardlessSandbox } from "@/lib/billing/gocardless";
import { stripeConfigured, stripeTestMode } from "@/lib/billing/stripe";
import { money, periodLabel, totals, type Invoice } from "@/lib/billing/types";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const date = (d: string | number) => new Date(typeof d === "string" ? `${d}T12:00:00Z` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: typeof d === "string" ? "UTC" : "America/Chicago" });
const lockPassed = (d: string) => d < new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const ordinal = (n: number) => `${n}${[, "st", "nd", "rd"][n % 100 >> 3 ^ 1 && n % 10] || "th"}`;
const TONE = {
  green: { chip: "bg-go-soft text-go", box: "border-go/25 bg-go-soft", bar: "bg-go" },
  yellow: { chip: "bg-[#fff3d6] text-[#8a5300]", box: "border-lane/40 bg-[#fff8e6]", bar: "bg-lane" },
  red: { chip: "bg-signal text-white", box: "border-signal/30 bg-warn-soft", bar: "bg-signal" },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requirePageStaff();
  const params = await searchParams;
  const header = <PageHeader title="Billing" description="Your AutoDash plan, this month's bill, what's included, and every past payment." />;
  if (!can.viewBilling(staff.role)) return <>{header}<p className="panel max-w-2xl p-5 text-muted">Only the dealership owner can see billing.</p></>;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Billing" /></>;

  const period = periodOf();
  // Once billing has started, this month's bill exists as soon as anyone opens this page.
  let createError: string | null = null;
  if (billingStarted(period)) {
    await fresh("Bill", () => ensureInvoice(period)).catch((e) => {
      createError = e instanceof Error ? e.message : String(e);
      console.error("[autodash:billing] couldn't create this month's bill:", createError);
    });
  }
  const whyNoBill = createError ? `Couldn't create this month's bill: ${createError}` : billingStartProblem(period);
  const acceptance = await getAcceptance();
  const [settings, invoices, usage, mandate, card] = await fresh("Billing", () => Promise.all([
    getBillingSettings(), listInvoices(), usageFor(period), getBankMandate().catch(() => null), getCardAutopay(),
  ]));
  const current = invoices.find((i) => i.period === period) ?? null;
  const autopay = Boolean(card || mandate);
  const manage = can.manageBilling(staff.role);
  const previewItems = current ? null : await fresh("Bill preview", () => draftItems(period, settings));
  const preview = previewItems ? { items: previewItems, ...totals(previewItems, settings) } : null;
  const shown = (current ?? preview)!;
  const tone = current ? billTone(current, autopay) : null;
  const pastDue = invoices.filter((i) => billTone(i, autopay).tone === "red");
  const notice = params.paid ? { ok: true, text: "Payment received. Thank you!" }
    : params.pending ? { ok: true, text: "Payment is processing. It will show as paid in a minute." }
    : params.canceled ? { ok: false, text: "Payment canceled. Nothing was charged." }
    : params.bank === "connected" ? { ok: true, text: "Bank account connected. Bills will be paid from it automatically." }
    : params.error ? { ok: false, text: "Couldn't open the payment page. Try again in a minute." } : null;

  return (
    <div className="max-w-5xl">
      {header}
      {notice && <p role={notice.ok ? "status" : "alert"} className={`mb-6 rounded-xl px-4 py-3 text-[15px] ${notice.ok ? "bg-go-soft text-go" : "border border-signal/25 bg-warn-soft"}`}>{notice.text}</p>}
      {!isCurrent(acceptance) && <AcceptAgreement canAccept={staff.role === "owner"} />}
      {(stripeTestMode() || gocardlessSandbox()) && <p className="mb-6 rounded-xl border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-sm"><b>Test mode.</b> Payments use test cards; no real money moves.</p>}

      {pastDue.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-signal/30 bg-warn-soft px-5 py-4">
          <p className="text-[17px] font-semibold text-signal">Payment past due</p>
          <p className="mt-1 text-[15px]">
            {pastDue.map((i) => `${periodLabel(i.period)} (${money(i.total)})`).join(", ")} {pastDue.length === 1 ? "is" : "are"} past due.
            {lockPassed(billTone(pastDue[pastDue.length - 1], autopay).lockOn!)
              ? <> Please pay now: AutoDash can be locked at any time until the balance is paid.</>
              : <> If it isn&apos;t paid by <b>{date(billTone(pastDue[pastDue.length - 1], autopay).lockOn!)}</b>, AutoDash will be locked until the balance is paid.</>}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {/* This month's bill */}
        <section aria-labelledby="bill" className="panel overflow-hidden">
          {tone && <div aria-hidden className={`h-1.5 ${TONE[tone.tone].bar}`} />}
          <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-2">
            <div>
              <h2 id="bill" className="text-[17px] font-semibold">{periodLabel(period)} bill</h2>
              <p className="text-sm text-muted">{current ? current.number : "Not created yet. Here's what it will be."}</p>
            </div>
            {tone && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${TONE[tone.tone].chip}`}>{tone.label}</span>}
          </div>
          {tone && <StatusBox tone={tone} />}
          <Breakdown items={shown.items} subtotal={shown.subtotal} tax={shown.tax} total={shown.total} taxNote={shown.tax === 0 ? "Sales tax (exempt)" : settings.taxRatePercent > 0 ? `Sales tax (${settings.taxRatePercent}% on ${settings.taxablePercent}% of the bill)` : "Sales tax"} />
          <div className="border-t border-line p-5">
            <PayArea invoice={current} manage={manage} autopay={autopay} hasMandate={Boolean(mandate)} dueDay={settings.dueDay} />
            {!current && whyNoBill && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm text-muted"><b>Why there&apos;s no bill yet:</b> {whyNoBill}</p>}
          </div>
        </section>

        {/* Plan, how you pay, usage */}
        <div className="grid gap-6">
          <section aria-labelledby="plan" className="panel p-5">
            <h2 id="plan" className="text-[17px] font-semibold">Your plan</h2>
            <p className="mt-2 font-condensed text-4xl font-semibold">{money(settings.monthlyCents)}<span className="font-sans text-base font-normal text-muted"> a month{settings.taxRatePercent > 0 ? ", plus tax" : ", no sales tax"}</span></p>
            <p className="mt-2 text-sm text-muted">Billed by {settings.billedBy || "AutoDash"}, due on the {ordinal(settings.dueDay)} of each month.</p>
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

          <section aria-labelledby="paying" className="panel p-5">
            <h2 id="paying" className="text-[17px] font-semibold">How you pay</h2>
            {card ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-[15px]"><span aria-hidden className="size-2.5 rounded-full bg-go" />
                  <span><b>Enrolled in autopay.</b> {card.brand[0].toUpperCase() + card.brand.slice(1)} ending in {card.last4} is charged automatically on the {ordinal(settings.dueDay)}.</span></p>
                <div className="mt-3"><TurnOffAutopayButton /></div>
              </>
            ) : mandate ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-[15px]"><span aria-hidden className="size-2.5 rounded-full bg-go" /><span><b>Enrolled in autopay</b> from your bank account, on the {ordinal(settings.dueDay)}.</span></p>
                <div className="mt-3"><DisconnectBankButton /></div>
              </>
            ) : (
              <p className="mt-2 text-[15px] text-muted">Not on autopay. When you pay a bill by card, tick <b>Pay automatically each month</b> and the next bills are paid for you.</p>
            )}
          </section>

          <section aria-labelledby="usage" className="panel p-5">
            <h2 id="usage" className="text-[17px] font-semibold">Used this month</h2>
            <Usage label="AI emails sent" used={usage.emails} included={settings.includedEmails} range={settings.emailRange} extra={settings.extraEmailCents} />
            <Usage label="AI texts sent" used={usage.texts} included={settings.includedTexts} range={settings.textRange} extra={settings.extraTextCents} />
          </section>
        </div>
      </div>

      <section aria-labelledby="history" className="mt-8">
        <h2 id="history" className="mb-3 text-lg font-semibold">Bills and payments</h2>
        {invoices.length === 0 ? <p className="panel p-5 text-muted">No bills yet.</p> : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[15px]">
              <thead className="text-sm text-muted"><tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Month</th><th className="px-3 py-3 font-medium">Bill</th><th className="px-3 py-3 font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Details</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => {
                  const t = billTone(i, autopay);
                  return (
                    <tr key={i.id}>
                      <td className="px-5 py-3 font-medium">{periodLabel(i.period)}</td>
                      <td className="px-3 py-3 text-muted">{i.number}</td>
                      <td className="px-3 py-3 tabular-nums">{money(i.total)}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[t.tone].chip}`}>{t.label}</span></td>
                      <td className="px-5 py-3 text-sm text-muted">
                        {i.status === "paid" ? `${t.detail}${i.method === "card" ? " by card" : i.method === "bank" ? " by bank" : ""}` : t.detail}
                        {i.status === "open" && i.period !== period && stripeConfigured() && (
                          <form action="/api/billing/checkout" method="post" className="mt-1"><input type="hidden" name="invoiceId" value={i.id} /><button className="btn btn-sm">Pay {money(i.total)}</button></form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="docs" className="mt-8">
        <h2 id="docs" className="mb-3 text-lg font-semibold">Documents</h2>
        <ul className="panel divide-y divide-line">
          {[...[{ title: "AutoDash Service Agreement (billing, AI use, responsibilities)", url: "/terms" }, { title: "Privacy Policy", url: "/privacy" }, { title: "Text Message Terms", url: "/sms-terms" }, { title: "Email Terms", url: "/email-terms" }], ...settings.documents].map((d) => (
            <li key={d.url} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="font-medium">{d.title}</span>
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="panel-link">Open</a>
            </li>
          ))}
        </ul>
        {acceptance && (
          <p className="mt-2 text-sm text-muted">
            Service Agreement {isCurrent(acceptance) ? "accepted" : `(version ${acceptance.version}) accepted`} by {acceptance.by} ({acceptance.email}) on {new Date(acceptance.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" })}.
          </p>
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

function StatusBox({ tone }: { tone: BillTone }) {
  return (
    <div className={`mx-5 mb-2 rounded-lg border px-4 py-3 text-[15px] ${TONE[tone.tone].box}`}>
      <p className="font-medium">{tone.detail}</p>
      {tone.lockOn && <p className="mt-1 text-sm">{lockPassed(tone.lockOn) ? "Please pay now: AutoDash can be locked at any time until this is paid." : `If this isn't paid by ${date(tone.lockOn)}, AutoDash will be locked until it's paid.`}</p>}
    </div>
  );
}

function PayArea({ invoice, manage, autopay, hasMandate, dueDay }: { invoice: Invoice | null; manage: boolean; autopay: boolean; hasMandate: boolean; dueDay: number }) {
  if (!invoice) return manage ? <CreateBillButton /> : <p className="text-sm text-muted">Your bill will appear here at the start of the month.</p>;
  if (invoice.status === "paid") return <p className="text-go">Paid. Thank you!</p>;
  if (invoice.status === "processing") return <p className="text-[15px] text-muted">{invoice.note ?? "Payment is processing."}</p>;
  return (
    <div className="grid gap-3">
      {invoice.note && <p className="text-sm text-signal">{invoice.note}</p>}
      {hasMandate && gocardlessConfigured() ? <RetryBankButton id={invoice.id} /> : stripeConfigured() ? (
        <form action="/api/billing/checkout" method="post" className="grid gap-3">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          {!autopay && (
            <label className="flex items-start gap-2.5 text-[15px]">
              <input type="checkbox" name="autopay" defaultChecked className="mt-1 size-4 accent-signal" />
              <span><b>Pay automatically each month</b><span className="block text-sm text-muted">Saves your card with Stripe and pays each bill on the {ordinal(dueDay)}. Turn it off anytime.</span></span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-red h-11 px-6 text-base">{autopay ? `Pay ${money(invoice.total)} now` : `Pay ${money(invoice.total)} with card`}</button>
            {autopay && <span className="text-sm text-muted">Or do nothing: autopay pays it on the due date.</span>}
          </div>
        </form>
      ) : <p className="text-sm text-muted">Online payment isn&apos;t set up yet.</p>}
      {manage && <VoidBillButton id={invoice.id} />}
    </div>
  );
}

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

function Usage({ label, used, included, range, extra }: { label: string; used: number; included: number; range: string; extra: number }) {
  const pct = included ? Math.min(100, (used / included) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{label}</p>
        <p className="tabular-nums"><b>{used.toLocaleString()}</b> <span className="text-muted">of {included.toLocaleString()} included</span></p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper" aria-hidden><div className={`h-full rounded-full ${pct >= 90 ? "bg-signal" : "bg-go"}`} style={{ width: `${Math.max(pct, used ? 2 : 0)}%` }} /></div>
      <p className="mt-1.5 text-sm text-muted">A normal month is about {range || "n/a"}. Past the included amount, each is {money(extra)}.</p>
    </div>
  );
}
