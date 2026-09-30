"use client";
import { useState, useTransition } from "react";
import { saveBillingSettingsAction } from "@/app/actions";
import { partsTotal, type BillingSettings } from "@/lib/billing/types";

const dollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: string) => Math.round(Number(v || 0) * 100);

export default function BillingSettingsForm({ initial }: { initial: BillingSettings }) {
  const [s, setS] = useState(initial);
  const [parts, setParts] = useState(initial.planParts.map((p) => ({ ...p, dollars: dollars(p.cents) })));
  const [money, setMoney] = useState({ monthly: dollars(initial.monthlyCents), setup: dollars(initial.setupFeeCents), email: dollars(initial.extraEmailCents), text: dollars(initial.extraTextCents) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => { setS({ ...s, [k]: v }); setMsg(null); };
  const save = () => start(async () => {
    const r = await saveBillingSettingsAction({ ...s, planParts: parts.map(({ label, detail, dollars: d }) => ({ label, detail, cents: toCents(d) })), monthlyCents: toCents(money.monthly), setupFeeCents: toCents(money.setup), extraEmailCents: toCents(money.email), extraTextCents: toCents(money.text) });
    setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
  });
  const m = (k: keyof typeof money) => ({ value: money[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setMoney({ ...money, [k]: e.target.value }); setMsg(null); } });

  return (
    <div className="panel grid gap-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="field">Monthly plan ($)<input className="input" inputMode="decimal" {...m("monthly")} /></label>
        <label className="field">Setup fee, first bill ($)<input className="input" inputMode="decimal" {...m("setup")} /></label>
        <label className="field">Sales tax rate (%)<input className="input" inputMode="decimal" value={s.taxRatePercent} onChange={(e) => set("taxRatePercent", Number(e.target.value))} /></label>
        <label className="field">Taxable share of bill (%)<input className="input" inputMode="decimal" value={s.taxablePercent} onChange={(e) => set("taxablePercent", Number(e.target.value))} /></label>
        <label className="field">AI emails included / month<input className="input" inputMode="numeric" value={s.includedEmails} onChange={(e) => set("includedEmails", Number(e.target.value))} /></label>
        <label className="field">Each extra email ($)<input className="input" inputMode="decimal" {...m("email")} /></label>
        <label className="field">AI texts included / month<input className="input" inputMode="numeric" value={s.includedTexts} onChange={(e) => set("includedTexts", Number(e.target.value))} /></label>
        <label className="field">Each extra text ($)<input className="input" inputMode="decimal" {...m("text")} /></label>
        <label className="field">Normal emails / month<input className="input" value={s.emailRange} onChange={(e) => set("emailRange", e.target.value)} placeholder="100 to 400" /></label>
        <label className="field">Normal texts / month<input className="input" value={s.textRange} onChange={(e) => set("textRange", e.target.value)} placeholder="0 to 500" /></label>
        <label className="field">Bill due on day<input className="input" inputMode="numeric" value={s.dueDay} onChange={(e) => set("dueDay", Number(e.target.value))} /></label>
        <label className="field">Billed by<input className="input" value={s.billedBy} onChange={(e) => set("billedBy", e.target.value)} /></label>
      </div>

      <div>
        <p className="text-sm font-medium text-muted">What the monthly price covers (shown to the owner)</p>
        <ul className="mt-2 grid gap-2">
          {parts.map((p, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <input className="input mt-0 w-64" value={p.label} placeholder="Hosting" aria-label="Part name"
                onChange={(e) => { setParts(parts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))); setMsg(null); }} />
              <input className="input mt-0 min-w-0 flex-1" value={p.detail} placeholder="What it means, in plain words" aria-label="Part description"
                onChange={(e) => { setParts(parts.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x))); setMsg(null); }} />
              <input className="input mt-0 w-28" inputMode="decimal" value={p.dollars} aria-label="Part price in dollars"
                onChange={(e) => { setParts(parts.map((x, j) => (j === i ? { ...x, dollars: e.target.value } : x))); setMsg(null); }} />
              <button type="button" className="btn btn-sm text-signal" onClick={() => setParts(parts.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-sm" onClick={() => setParts([...parts, { label: "", detail: "", cents: 0, dollars: "0.00" }])}>Add part</button>
          {(() => {
            const sum = partsTotal(parts.map((p) => ({ ...p, cents: toCents(p.dollars) })));
            const plan = toCents(money.monthly);
            return <span className={`text-sm ${sum === plan ? "text-go" : "text-signal"}`}>
              Parts add up to ${(sum / 100).toFixed(2)}{sum === plan ? ", matching the plan." : ` but the plan is $${(plan / 100).toFixed(2)}. Make them match.`}
            </span>;
          })()}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-muted">Documents (links that open the file, like a Google Drive share link)</p>
        <ul className="mt-2 grid gap-2">
          {s.documents.map((d, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <input className="input mt-0 w-56" value={d.title} placeholder="Service agreement" aria-label="Document name"
                onChange={(e) => set("documents", s.documents.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input className="input mt-0 min-w-0 flex-1" value={d.url} placeholder="https://…" aria-label="Document link"
                onChange={(e) => set("documents", s.documents.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" className="btn btn-sm text-signal" onClick={() => set("documents", s.documents.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-sm mt-2" onClick={() => set("documents", [...s.documents, { title: "", url: "" }])}>Add document</button>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-red" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save prices and settings"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
