"use client";
import { useState, useTransition } from "react";
import { setupDatabaseAction } from "@/app/actions";

export default function SetupDatabase({ label }: { label: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <button type="button" disabled={pending}
        onClick={() => start(async () => {
          const r = await setupDatabaseAction();
          setResult({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error });
        })}
        className="inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark disabled:opacity-60">
        {pending ? "Setting up…" : label}
      </button>
      {result && <p role={result.ok ? "status" : "alert"} className={`mt-3 text-sm ${result.ok ? "text-go" : "text-signal"}`}>{result.text}</p>}
    </div>
  );
}
