"use client";
import { useState, useTransition } from "react";
import { setAiChannelAction } from "@/app/actions";

/** The big on/off for the AI on one channel (emails or texts). Off: it writes and sends nothing by itself. */
export default function AiChannelSwitch({ channel, initial, canChange }: { channel: "email" | "text"; initial: boolean; canChange: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const what = channel === "email" ? "emails" : "texts";
  const flip = () => {
    const next = !on;
    if (!next && !window.confirm(`Turn the AI off for ${what}? It won't write or send anything by itself until you turn it back on.`)) return;
    start(async () => {
      const r = await setAiChannelAction(channel, next);
      if (r.ok) setOn(next);
      setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="button" role="switch" aria-checked={on} aria-label={`AI for ${what}`} disabled={!canChange || pending} onClick={flip}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold">AI {what}: {on ? "On" : "Off"}</p>
        <p className="text-sm text-muted">{on ? `The AI handles ${what} for you.` : `The AI does nothing by itself for ${what}. You can still use the buttons on this page by hand.`}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
