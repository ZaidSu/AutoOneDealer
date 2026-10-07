"use client";
import { useState, useTransition } from "react";
import { summarizeCustomerAction } from "@/app/actions";
import type { CustomerSummary } from "@/lib/ai/summary";

const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

/** "What's happened with this customer", written by the AI from their leads, emails, AI replies, texts and notes. */
export default function AiSummary({ customerKey, initial, aiReady }: { customerKey: string; initial: CustomerSummary | null; aiReady: boolean }) {
  const [summary, setSummary] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setError("");
    const r = await summarizeCustomerAction(customerKey);
    if (r.ok && r.summary) setSummary(r.summary);
    else if (!r.ok) setError(r.error);
  });
  return (
    <section aria-labelledby="ai-summary" className="panel mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ai-summary" className="text-[17px] font-semibold">AI summary</h2>
          <p className="text-sm text-muted">
            {summary ? `Updated ${when(summary.updatedAt)}${summary.sources ? `, from ${summary.sources}` : ""}` : "What's happened with this customer so far, from their emails, AI replies, texts and your team's notes."}
          </p>
        </div>
        <button type="button" className="btn btn-sm" disabled={pending || !aiReady} onClick={run}
          title={aiReady ? undefined : "Add ANTHROPIC_API_KEY in Vercel to turn this on"}>
          {pending ? "Reading everything…" : summary ? "Update summary" : "Summarize"}
        </button>
      </div>
      {summary && (
        <div className="mt-3">
          <p className="text-[15px] leading-relaxed">{summary.summary}</p>
          {summary.nextStep && <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-[15px]"><span className="font-semibold">Next step:</span> {summary.nextStep}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-signal">{error}</p>}
    </section>
  );
}
