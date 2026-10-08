"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { scanPastConversationsAction } from "@/app/actions";

/** Checks the last 14 days of conversations and texts the dealership phone about anyone who needed a person and was missed. */
export default function RepAlertScan() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-3 rounded-xl bg-paper p-3">
      <p className="text-sm text-muted">Look back through the last 14 days for customers who asked for a Carfax, talked numbers or wanted to buy before alerts were on. The dealership phone gets one text for each one found (never more than one per customer). This reads their conversations, so it takes up to a minute.</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await scanPastConversationsAction();
          if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
          const found = r.alerted ?? [];
          const list = found.length ? ` Texted the dealership about: ${found.map((a) => `${a.name} (${a.reason})`).join("; ")}.` : " Nobody needed an alert.";
          setMsg({ ok: true, text: `Checked ${r.checked ?? 0} customers.${list}${r.remaining ? ` ${r.remaining} more to check: click again.` : " That's everyone."}` });
          router.refresh();
        })}>{pending ? "Checking conversations…" : "Check the last 14 days"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
