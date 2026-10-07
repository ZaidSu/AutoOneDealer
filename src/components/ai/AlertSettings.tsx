"use client";
import { useState, useTransition } from "react";
import { saveAlertSettingsAction, sendMorningBriefingNowAction } from "@/app/actions";

type S = { waiting: { on: boolean; minutes: number }; morning: { on: boolean; hour: number }; inventory: { on: boolean; hours: number }; to: string };
const WAIT = [[30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"]] as const;
const HOURS = [5, 6, 7, 8, 9, 10, 11, 12].map((h) => [h, `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`] as const);
const INV = [[2, "2 hours"], [4, "4 hours"], [8, "8 hours"], [12, "12 hours"]] as const;
const sel = "ml-2 h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink";

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

/** Three extra emails to the dealership inbox, each with its own switch: customers waiting, a morning briefing, and an inventory problem alert. */
export default function AlertSettings({ initial, mailbox, canChange }: { initial: S; mailbox: string; canChange: boolean }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const off = !canChange || pending;
  const save = (next: S) => start(async () => {
    const r = await saveAlertSettingsAction(next);
    if (r.ok) setS(next);
    setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Switch on={s.waiting.on} disabled={off} label="Waiting customer alert" onClick={() => save({ ...s, waiting: { ...s.waiting, on: !s.waiting.on } })} />
        <div className="min-w-0 flex-1"><b>Customer waiting</b><span className="text-sm text-muted"> — email me if a new customer hasn&apos;t been contacted after</span>
          <select className={sel} value={s.waiting.minutes} disabled={off} onChange={(e) => setS({ ...s, waiting: { ...s.waiting, minutes: Number(e.target.value) } })}>{WAIT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Switch on={s.morning.on} disabled={off} label="Morning briefing" onClick={() => save({ ...s, morning: { ...s.morning, on: !s.morning.on } })} />
        <div className="min-w-0 flex-1"><b>Morning briefing</b><span className="text-sm text-muted"> — today&apos;s appointments and who is waiting, sent each day at</span>
          <select className={sel} value={s.morning.hour} disabled={off} onChange={(e) => setS({ ...s, morning: { ...s.morning, hour: Number(e.target.value) } })}>{HOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Switch on={s.inventory.on} disabled={off} label="Inventory problem alert" onClick={() => save({ ...s, inventory: { ...s.inventory, on: !s.inventory.on } })} />
        <div className="min-w-0 flex-1"><b>Inventory problem</b><span className="text-sm text-muted"> — email me if the website&apos;s cars can&apos;t be read for</span>
          <select className={sel} value={s.inventory.hours} disabled={off} onChange={(e) => setS({ ...s, inventory: { ...s.inventory, hours: Number(e.target.value) } })}>{INV.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <label className="block text-sm text-muted">Send these to
        <input type="email" value={s.to} placeholder={mailbox || "the dealership inbox"} disabled={off} onChange={(e) => setS({ ...s, to: e.target.value })} className="ml-2 h-10 w-64 max-w-full rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" disabled={off} onClick={() => save(s)}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={off} onClick={() => start(async () => { const r = await sendMorningBriefingNowAction(); setMsg(r.ok ? { ok: true, text: r.message ?? "Sent" } : { ok: false, text: r.error }); })}>Send a morning briefing now</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
