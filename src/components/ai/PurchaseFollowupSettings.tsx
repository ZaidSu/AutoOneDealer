"use client";
import { useState, useTransition } from "react";
import { savePurchaseFollowupAction } from "@/app/actions";

/** On/off and how many days after a purchase the AI texts the customer. */
export default function PurchaseFollowupSettings({ initialOn, initialDays, canChange }: { initialOn: boolean; initialDays: number; canChange: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [days, setDays] = useState(String(initialDays));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (nextOn: boolean) => start(async () => {
    const r = await savePurchaseFollowupAction(nextOn, Number(days));
    if (r.ok) setOn(nextOn);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
  });
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <button type="button" role="switch" aria-checked={on} aria-label="Purchase follow-up texts" disabled={!canChange || pending} onClick={() => save(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
      <label className="text-sm text-muted">Days after the purchase
        <input type="number" min={1} max={60} value={days} disabled={!canChange || pending} onChange={(e) => setDays(e.target.value)}
          className="ml-2 h-10 w-20 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
      </label>
      <button type="button" className="btn" disabled={!canChange || pending} onClick={() => save(on)}>{pending ? "Saving…" : "Save"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
