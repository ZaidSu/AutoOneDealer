"use client";
import { useState, useTransition } from "react";
import { sendTestTextAction } from "@/app/actions";

/** Developer-only: send one test text to a phone to check that Twilio works. */
export default function TestTextButton() {
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <h3 className="font-semibold">Send a test text</h3>
      <p className="text-sm text-muted">Texts your phone from the dealership number. Reply to it afterwards to check that incoming texts show up. Only you see this.</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="field">Your phone number<input className="input w-48" inputMode="tel" placeholder="(469) 555-0111" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <button type="button" className="btn" disabled={pending || !phone.trim()} onClick={() => start(async () => {
          const r = await sendTestTextAction(phone);
          setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
        })}>{pending ? "Sending…" : "Send test text"}</button>
      </div>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
