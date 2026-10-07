"use client";
import { useState, useTransition } from "react";
import { saveAiScheduleAction } from "@/app/actions";

const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 7]] as const;
const input = "h-10 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink disabled:opacity-60";

/** Which days the AI works and from what time to what time (Dallas time). Replies and texts go out only then. */
export default function AiScheduleForm({ initial, canChange }: { initial: { days: number[]; from: string; to: string }; canChange: boolean }) {
  const [days, setDays] = useState<number[]>(initial.days);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  return (
    <div className="space-y-4">
      <fieldset disabled={!canChange || pending}>
        <legend className="mb-2 text-sm text-muted">Days the AI works</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(([label, n]) => (
            <button key={n} type="button" aria-pressed={days.includes(n)} onClick={() => toggle(n)}
              className={`h-10 min-w-14 rounded-md border px-3 text-[15px] font-semibold transition-colors disabled:opacity-60 ${days.includes(n) ? "border-graphite bg-graphite text-white" : "border-line bg-white text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="text-sm text-muted">From
          <input type="time" value={from} disabled={!canChange || pending} onChange={(e) => setFrom(e.target.value)} className={`${input} ml-2`} />
        </label>
        <label className="text-sm text-muted">To
          <input type="time" value={to} disabled={!canChange || pending} onChange={(e) => setTo(e.target.value)} className={`${input} ml-2`} />
        </label>
        <button type="button" className="btn" disabled={!canChange || pending}
          onClick={() => start(async () => { const r = await saveAiScheduleAction({ days, from, to }); setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error }); })}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
