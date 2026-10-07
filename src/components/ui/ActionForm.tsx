"use client";
// A form that saves through a server action and shows the result under the button.
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

export default function ActionForm({ action, submitLabel, children, reset = true, onSuccess, disabled }: {
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  /** Clear the fields after saving. Forms that keep their own state turn this off. */
  reset?: boolean;
  onSuccess?: (message?: string, id?: string) => void;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      const result = await action(data);
      if (result.ok) {
        setMsg({ ok: true, text: result.message ?? "Saved." });
        if (reset) form.reset();
        onSuccess?.(result.message, result.id);
      } else {
        setMsg({ ok: false, text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} onChange={() => msg && setMsg(null)}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || disabled} className="btn btn-primary">{pending ? "Saving\u2026" : submitLabel}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-go" : "text-bad"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
