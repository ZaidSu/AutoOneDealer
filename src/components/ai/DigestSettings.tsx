"use client";
import { useState, useTransition } from "react";
import { saveDigestSettingsAction, sendDigestNowAction } from "@/app/actions";

const EVERY = [[30, "30 minutes"], [60, "1 hour"], [90, "1 hour 30 minutes"], [120, "2 hours"], [180, "3 hours"]] as const;
type Initial = { on: boolean; everyMin: number; to: string; anyTime: boolean; appointments: boolean; inventory: boolean };

/** The update email to the dealership inbox: on/off, how often, where it goes, what's in it. */
export default function DigestSettings({ initial, mailbox, canChange, canSend, status }: { initial: Initial; mailbox: string; canChange: boolean; canSend: boolean; status: string | null }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (next: Initial) => start(async () => {
    const r = await saveDigestSettingsAction(next);
    if (r.ok) setS(next);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
  });
  const box = (key: "anyTime" | "appointments" | "inventory", label: string) => (
    <label className="flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" checked={s[key]} disabled={!canChange || pending} onChange={(e) => setS({ ...s, [key]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" role="switch" aria-checked={s.on} aria-label="Update emails" disabled={!canChange || pending} onClick={() => save({ ...s, on: !s.on })}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${s.on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${s.on ? "left-6" : "left-1"}`} />
        </button>
        <label className="text-sm text-muted">Every
          <select value={s.everyMin} disabled={!canChange || pending} onChange={(e) => setS({ ...s, everyMin: Number(e.target.value) })} className="ml-2 h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink">
            {EVERY.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Send to
          <input type="email" value={s.to} placeholder={mailbox || "the dealership inbox"} disabled={!canChange || pending} onChange={(e) => setS({ ...s, to: e.target.value })}
            className="ml-2 h-10 w-64 max-w-full rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {box("anyTime", "Also send outside the AI's working hours")}
        {box("appointments", "Include appointments")}
        {box("inventory", "Include new and sold cars")}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" disabled={!canChange || pending} onClick={() => save(s)}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={!canChange || pending || !canSend}
          onClick={() => start(async () => { const r = await sendDigestNowAction(); setMsg(r.ok ? { ok: true, text: r.message ?? "Sent" } : { ok: false, text: r.error }); })}>
          Send one now
        </button>
      </div>
      {!canSend && <p className="text-sm text-muted">Gmail can&apos;t send yet. Reconnect Gmail in Settings first.</p>}
      {status && <p className="text-sm text-muted">Last check by the timer: {status}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
