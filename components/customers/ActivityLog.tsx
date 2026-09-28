"use client";
// Quick buttons to record what happened with a customer. Shows in their history right away.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logActivityAction } from "@/app/actions";
import type { ActivityKind } from "@/lib/crm/queries";

const QUICK: { kind: ActivityKind; label: string }[] = [
  { kind: "call", label: "Called, talked" },
  { kind: "voicemail", label: "Called, no answer" },
  { kind: "text", label: "Texted" },
  { kind: "email", label: "Emailed" },
  { kind: "visit", label: "Visited the lot" },
];

export default function ActivityLog({ customerKey }: { customerKey: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function log(kind: ActivityKind) {
    start(async () => {
      const r = await logActivityAction(customerKey, kind, note);
      setMessage(r.ok ? { ok: true, text: r.message ?? "Added." } : { ok: false, text: r.error });
      if (r.ok) { setNote(""); router.refresh(); }
    });
  }

  return (
    <div className="card mt-3 p-4">
      <label className="block text-sm text-muted">What happened?
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Wants to trade in a 2012 Accord, coming Saturday"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q.kind} type="button" disabled={pending} onClick={() => log(q.kind)} className="btn btn-sm">{q.label}</button>
        ))}
        <button type="button" disabled={pending || !note.trim()} onClick={() => log("note")} className="btn btn-sm btn-primary">Save note</button>
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-sm ${message.ok ? "text-go" : "text-signal"}`}>{message.text}</p>}
    </div>
  );
}
