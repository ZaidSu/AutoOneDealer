"use client";
import { useState, useTransition } from "react";
import { saveDigestSettingsAction, sendDigestNowAction } from "@/app/actions";

const EVERY = [[30, "30 minutes"], [60, "1 hour"], [90, "1 hour 30 minutes"], [120, "2 hours"], [180, "3 hours"]] as const;

/** The update email to the dealership inbox: on/off, how often, where it goes. */
export default function DigestSettings({ initial, mailbox, canChange, canSend }: { initial: { on: boolean; everyMin: number; to: string }; mailbox: string; canChange: boolean; canSend: boolean }) {
  const [on, setOn] = useState(initial.on);
  const [every, setEvery] = useState(initial.everyMin);
  const [to, setTo] = useState(initial.to);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (nextOn: boolean) => start(async () => {
    const r = await saveDigestSettingsAction({ on: nextOn, everyMin: every, to });
    if (r.ok) setOn(nextOn);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" role="switch" aria-checked={on} aria-label="Update emails" disabled={!canChange || pending} onClick={() => save(!on)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
        <label className="text-sm text-muted">Every
          <select value={every} disabled={!canChange || pending} onChange={(e) => setEvery(Number(e.target.value))} className="ml-2 h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink">
            {EVERY.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Send to
          <input type="email" value={to} placeholder={mailbox || "the dealership inbox"} disabled={!canChange || pending} onChange={(e) => setTo(e.target.value)}
            className="ml-2 h-10 w-64 max-w-full rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
        <button type="button" className="btn" disabled={!canChange || pending} onClick={() => save(on)}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={!canChange || pending || !canSend}
          onClick={() => start(async () => { const r = await sendDigestNowAction(); setMsg(r.ok ? { ok: true, text: r.message ?? "Sent" } : { ok: false, text: r.error }); })}>
          Send one now
        </button>
      </div>
      {!canSend && <p className="text-sm text-muted">Gmail can&apos;t send yet. Reconnect Gmail in Settings first.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
