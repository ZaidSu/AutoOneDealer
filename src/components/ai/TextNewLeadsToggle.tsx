"use client";
import { useState, useTransition } from "react";
import { setTextNewLeadsAction } from "@/app/actions";

/** On: a new lead with a phone number gets a first text from the AI as well as the email. */
export default function TextNewLeadsToggle({ initial, canChange }: { initial: boolean; canChange: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !on;
    if (next && !window.confirm("Text every new lead that has a phone number? Only turn this on if your lead forms (and your Twilio campaign) say customers agree to be texted. With Automatic texting off, the texts wait as drafts for someone to send.")) return;
    start(async () => {
      const r = await setTextNewLeadsAction(next);
      if (r.ok) setOn(next);
      setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="button" role="switch" aria-checked={on} aria-label="Text new leads" disabled={!canChange || pending} onClick={flip}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Text new leads is {on ? "on" : "off"}</p>
        <p className="text-sm text-muted">{on ? "A new lead with a phone number gets a short first text, in addition to the email. Follows the Automatic texting setting." : "New leads only get the AI email."}</p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
