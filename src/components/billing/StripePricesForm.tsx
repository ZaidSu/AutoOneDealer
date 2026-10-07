"use client";
import { useState, useTransition } from "react";
import { addChargeAction, removeChargeAction, setMonthlyPriceAction } from "@/app/actions";

type Props = { monthly: number | null; charges: { id: string; label: string; cents: number }[]; dashboardUrl: string; nextDate: string | null };
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Developer-only: change the monthly price and add or remove one-time charges. Saved in Stripe; the bill preview updates after. */
export default function StripePricesForm({ monthly, charges, dashboardUrl, nextDate }: Props) {
  const [price, setPrice] = useState(monthly === null ? "" : (monthly / 100).toFixed(2));
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await work();
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      if (r.ok) after?.();
    });
  return (
    <div className="panel grid gap-6 p-5">
      <div>
        <h3 className="font-semibold">Monthly price</h3>
        <p className="text-sm text-muted">Saved in Stripe. Applies from the next invoice{nextDate ? ` (${nextDate})` : ""}, with no refund or extra charge for the current one.</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="field">Price per month ($)<input className="input w-40" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => setMonthlyPriceAction(price))}>{pending ? "Saving…" : "Save price"}</button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold">One-time charges on the next invoice</h3>
        {charges.length === 0 ? <p className="text-sm text-muted">None right now.</p> : (
          <ul className="mt-1 divide-y divide-line">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span>{c.label}</span>
                <span className="flex items-center gap-3"><span className="tabular-nums">{usd(c.cents)}</span>
                  <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => removeChargeAction(c.id))}>Remove</button></span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="field">Name<input className="input w-64 max-w-full" value={label} placeholder="Setup fee" onChange={(e) => setLabel(e.target.value)} /></label>
          <label className="field">Amount ($)<input className="input w-32" inputMode="decimal" value={amount} placeholder="99" onChange={(e) => setAmount(e.target.value)} /></label>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => addChargeAction(label, amount), () => { setLabel(""); setAmount(""); })}>Add charge</button>
        </div>
        <p className="mt-1 text-sm text-muted">Use a minus sign for a credit or discount, like -20.</p>
      </div>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      <p className="text-sm text-muted">Everything else (refunds, coupons, pausing, payouts) is done in <a className="panel-link" href={dashboardUrl} target="_blank" rel="noopener noreferrer">Stripe</a>.</p>
    </div>
  );
}
