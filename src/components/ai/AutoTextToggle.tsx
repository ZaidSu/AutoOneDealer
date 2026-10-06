"use client";
import { useState, useTransition } from "react";
import { setAutoTextAction } from "@/app/actions";

/** On: the AI texts customers back by itself during AI hours. Off: it writes drafts for a person to send. */
export default function AutoTextToggle({ initial, canChange }: { initial: boolean; canChange: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !on;
    if (next && !window.confirm("Turn on automatic texting? The AI will text customers back by itself during the AI hours (set under Automations), without anyone checking first. Every text shows here and on the customer's page.")) return;
    start(async () => {
      const r = await setAutoTextAction(next);
      if (r.ok) setOn(next);
      setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="button" role="switch" aria-checked={on} aria-label="Automatic texting" disabled={!canChange || pending} onClick={flip}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Automatic texting is {on ? "on" : "off"}</p>
        <p className="text-sm text-muted">{on ? "The AI texts customers back by itself during AI hours." : "The AI writes a reply to each customer text; someone checks it and clicks Send."}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
