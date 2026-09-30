"use client";
import { useState, useTransition } from "react";
import { saveAiTrainingAction } from "@/app/actions";
import type { AiTraining } from "@/lib/ai/types";

export default function TrainingForm({ initial, canEdit }: { initial: AiTraining; canEdit: boolean }) {
  const [t, setT] = useState(initial);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveAiTrainingAction(t);
    setResult(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
  });

  return (
    <div className="grid gap-6">
      <section className="panel p-5">
        <h2 className="text-[17px] font-semibold">How the AI should talk</h2>
        <p className="mt-1 text-sm text-muted">Tone, what to always do, what never to say. Write it like you&apos;re training a new salesperson.</p>
        <textarea className="input mt-3" rows={8} disabled={!canEdit} value={t.instructions}
          onChange={(e) => { setT({ ...t, instructions: e.target.value }); setResult(null); }}
          placeholder={"Be friendly and short. Always ask when they'd like to come see the car.\nNever promise a price or an approval. Offer to have a salesperson call instead."} />
      </section>
      <section className="panel p-5">
        <h2 className="text-[17px] font-semibold">Questions customers ask, and your answers</h2>
        <p className="mt-1 text-sm text-muted">One question and answer per paragraph.</p>
        <textarea className="input mt-3" rows={10} disabled={!canEdit} value={t.faqs}
          onChange={(e) => { setT({ ...t, faqs: e.target.value }); setResult(null); }}
          placeholder={"Is the car still available?\nCheck with a salesperson and offer an appointment time today or tomorrow.\n\nDo you finance?\nYes. Everyone can apply, and we work with all credit."} />
      </section>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="button" disabled={pending} onClick={save} className="btn btn-red">{pending ? "Saving…" : "Save training"}</button>
          {result && <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-go" : "text-signal"}`}>{result.text}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted">Only owners and managers can change this.</p>
      )}
    </div>
  );
}
