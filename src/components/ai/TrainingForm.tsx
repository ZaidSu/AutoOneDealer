"use client";
import { useState, useTransition } from "react";
import { saveAiInstructionsAction, saveAiQaAction } from "@/app/actions";
import ReadOnlyNotice from "@/components/ai/ReadOnlyNotice";
import type { AiTraining, QA } from "@/lib/ai/types";

type Msg = { ok: boolean; text: string } | null;
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function TrainingForm({ initial, canEdit }: { initial: AiTraining; canEdit: boolean }) {
  return (
    <div className="grid gap-6">
      {!canEdit && <ReadOnlyNotice />}
      <Instructions initial={initial.instructions} canEdit={canEdit} />
      <QuestionList initial={initial.qa} canEdit={canEdit} />
    </div>
  );
}

function Instructions({ initial, canEdit }: { initial: string; canEdit: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveAiInstructionsAction(text);
    if (r.ok) setSaved(text);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
  });
  return (
    <section className="panel p-5">
      <h2 className="text-[17px] font-semibold">How the AI should talk</h2>
      <p className="mt-1 text-sm text-muted">Tone, what to always do, what never to say. Write it like you&apos;re training a new salesperson.</p>
      <textarea className="input mt-3" rows={6} disabled={!canEdit} value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null); }}
        placeholder={"Be friendly and short. Always ask when they'd like to come see the car.\nNever promise a price or an approval. Offer to have a salesperson call instead."} />
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="btn btn-red" disabled={pending || text === saved} onClick={save}>{pending ? "Saving…" : "Save"}</button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
        </div>
      )}
    </section>
  );
}

function QuestionList({ initial, canEdit }: { initial: QA[]; canEdit: boolean }) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null); // an id, "new", or nothing
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  // Every change saves the whole list; the list on screen only changes once the save worked.
  const commit = (next: QA[], done: string) => start(async () => {
    const r = await saveAiQaAction(next);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setList(r.qa ?? next);
    setEditing(null);
    setMsg({ ok: true, text: done });
  });

  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="text-[17px] font-semibold">Questions customers ask</h2>
          <p className="mt-1 text-sm text-muted">{list.length === 0 ? "Add the questions you hear most, with the answer the AI should give." : `${list.length} ${list.length === 1 ? "question" : "questions"}. The AI answers these the way you wrote them.`}</p>
        </div>
        {canEdit && editing !== "new" && (
          <button type="button" className="btn btn-red" onClick={() => { setEditing("new"); setMsg(null); }}>Add question</button>
        )}
      </div>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`px-5 pb-2 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}

      {editing === "new" && (
        <div className="px-5 pb-4">
          <QaEditor pending={pending} onCancel={() => setEditing(null)}
            onSave={(q, a) => commit([{ id: newId(), question: q, answer: a }, ...list], "Question added.")} />
        </div>
      )}

      {list.length === 0 && editing !== "new" ? (
        <p className="mx-5 mb-5 rounded-lg border border-dashed border-line p-5 text-center text-muted">No questions yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((item) => (
            <li key={item.id} className="px-5 py-4">
              {editing === item.id ? (
                <QaEditor initialQ={item.question} initialA={item.answer} pending={pending} onCancel={() => setEditing(null)}
                  onSave={(q, a) => commit(list.map((x) => (x.id === item.id ? { ...x, question: q, answer: a } : x)), "Changes saved.")} />
              ) : (
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.question}</p>
                    <p className="mt-1 whitespace-pre-line text-muted">{item.answer}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-start gap-1">
                      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { setEditing(item.id); setMsg(null); }}>Edit</button>
                      <button type="button" className="btn btn-sm text-signal" disabled={pending}
                        onClick={() => { if (window.confirm(`Delete "${item.question}"?`)) commit(list.filter((x) => x.id !== item.id), "Question deleted."); }}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QaEditor({ initialQ = "", initialA = "", pending, onSave, onCancel }: {
  initialQ?: string; initialA?: string; pending: boolean; onSave: (q: string, a: string) => void; onCancel: () => void;
}) {
  const [q, setQ] = useState(initialQ);
  const [a, setA] = useState(initialA);
  const [error, setError] = useState("");
  const save = () => {
    if (!q.trim()) return setError("Write the question.");
    if (!a.trim()) return setError("Write the answer the AI should give.");
    onSave(q.trim(), a.trim());
  };
  return (
    <div className="rounded-xl border border-line bg-paper/60 p-4">
      <label className="field">Question
        <input className="input" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setError(""); }} placeholder="Is the car still available?" />
      </label>
      <label className="field mt-3">Answer
        <textarea className="input" rows={3} value={a} onChange={(e) => { setA(e.target.value); setError(""); }}
          placeholder="Yes! When would you like to come see it? We're open until 7 PM." />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-red" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={pending} onClick={onCancel}>Cancel</button>
        {error && <p role="alert" className="text-sm text-signal">{error}</p>}
      </div>
    </div>
  );
}
