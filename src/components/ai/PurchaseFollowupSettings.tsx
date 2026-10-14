"use client";
import { useState, useTransition } from "react";
import { savePurchaseFollowupAction } from "@/app/actions";
import { FOLLOWUP_PLACEHOLDERS, MAX_FOLLOWUP_MESSAGE, renderFollowupMessage } from "@/lib/sms/followup-rules";

const EXAMPLE = "Hi {first_name}, it's {dealership}. How's your {car} treating you? Let us know if anything comes up, we're here to help!";

/** On/off, how many days after a purchase the customer is texted, and the message itself (the AI's wording, or your own). */
export default function PurchaseFollowupSettings({ initialOn, initialDays, initialMessage, canChange }: { initialOn: boolean; initialDays: number; initialMessage: string; canChange: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [days, setDays] = useState(String(initialDays));
  const [own, setOwn] = useState(Boolean(initialMessage));
  const [message, setMessage] = useState(initialMessage);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = (nextOn: boolean) => start(async () => {
    if (own && !message.trim()) return setMsg({ ok: false, text: "Write your message, or choose “Let the AI write it”." });
    const r = await savePurchaseFollowupAction(nextOn, Number(days), own ? message : "");
    if (r.ok) setOn(nextOn);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" role="switch" aria-checked={on} aria-label="Purchase follow-up texts" disabled={!canChange || pending} onClick={() => save(!on)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
        <label className="text-sm text-muted">Days after the purchase
          <input type="number" min={1} max={60} value={days} disabled={!canChange || pending} onChange={(e) => setDays(e.target.value)}
            className="ml-2 h-10 w-20 rounded-md border border-line bg-white px-2.5 text-[15px] text-ink" />
        </label>
      </div>

      <fieldset className="grid gap-2" disabled={!canChange || pending}>
        <legend className="text-sm font-semibold">What the text says</legend>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="fu-mode" className="mt-1 size-4 accent-signal" checked={!own} onChange={() => { setOwn(false); setMsg(null); }} />
          <span>Let the AI write it <span className="text-muted">(a short, friendly check-in, different each time)</span></span>
        </label>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="radio" name="fu-mode" className="mt-1 size-4 accent-signal" checked={own} onChange={() => { setOwn(true); if (!message) setMessage(EXAMPLE); setMsg(null); }} />
          <span>Use my own message <span className="text-muted">(sent exactly as written)</span></span>
        </label>
        {own && (
          <div className="ml-6">
            <textarea className="input" rows={4} maxLength={MAX_FOLLOWUP_MESSAGE} value={message} onChange={(e) => { setMessage(e.target.value); setMsg(null); }} />
            <p className="mt-1 text-sm text-muted">
              Fills in per customer: {FOLLOWUP_PLACEHOLDERS.map((p, i) => <span key={p}>{i ? ", " : ""}<code className="rounded bg-line/50 px-1">{p}</code></span>)}.
              {" "}{message.length}/{MAX_FOLLOWUP_MESSAGE} characters. &ldquo;Reply STOP to opt out&rdquo; is added automatically.
            </p>
            <p className="mt-2 rounded-md bg-paper px-3 py-2 text-[15px]"><span className="text-sm font-semibold text-muted">Example for Sam, who bought a 2019 Honda Civic: </span>{renderFollowupMessage(message, { firstName: "Sam", car: "2019 Honda Civic", dealership: "Auto One Motors" }) || "…"}</p>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-red" disabled={!canChange || pending} onClick={() => save(on)}>{pending ? "Saving…" : "Save"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
