"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SetupDatabase({ label }: { label: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/developer/setup-database", { method: "POST" });
      const data = await response.json().catch(() => null);
      setResult(data ? { ok: data.ok, text: data.message } : { ok: false, text: `The server answered with status ${response.status} and no details.` });
      if (data?.ok) router.refresh();
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server. Check your internet connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button type="button" disabled={pending} onClick={run}
        className="inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark disabled:opacity-60">
        {pending ? "Setting up…" : label}
      </button>
      {result && <p role={result.ok ? "status" : "alert"} className={`mt-3 break-words text-sm ${result.ok ? "text-go" : "text-signal"}`}>{result.text}</p>}
    </div>
  );
}
