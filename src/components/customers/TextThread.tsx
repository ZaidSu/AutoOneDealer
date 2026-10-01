"use client";
// A customer's text conversation, like a phone's Messages app: their texts on the left, the dealership's on the
// right (AI-written ones marked), an AI draft waiting for approval, and a box to text them yourself.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { aiDraftTextAction, discardTextDraftAction, sendTextAction, sendTextDraftAction } from "@/app/actions";
import type { TextMessage } from "@/lib/sms";

type Data = { configured: boolean; ai: boolean; phone: string | null; optedOut: boolean; messages: TextMessage[] };
const time = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export default function TextThread({ customerKey, firstName }: { customerKey: string; firstName: string | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [draftText, setDraftText] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(customerKey)}/texts`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't load texts");
      setData(await r.json());
      setLoadError("");
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Couldn't load texts"); }
  }, [customerKey]);
  // New texts show up on their own: check every 8 seconds while the page is open and visible.
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const messages = data?.messages ?? [];
  const sent = messages.filter((m) => m.status !== "draft");
  const draft = messages.find((m) => m.status === "draft") ?? null;
  useEffect(() => { setDraftText(draft ? draft.body : null); }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [sent.length]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? (r.message && r.message !== "Sent." ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
    if (r.ok) after?.();
    await load();
  });

  const blocked = !data?.configured ? "Texting isn't set up yet." : !data.phone ? "This customer has no phone number that can get texts." : data.optedOut ? `${firstName ?? "This customer"} replied STOP, so they can't be texted unless they reply START.` : "";

  return (
    <section id="texts" aria-labelledby="texts-title" className="panel mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="texts-title" className="text-[17px] font-semibold">Texts</h2>
          <p className="text-sm text-muted">{data?.phone ? `With ${data.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}` : "Text conversation with this customer"}</p>
        </div>
        {data?.ai && !blocked && !draft && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => aiDraftTextAction(customerKey))}>
            {pending ? "Writing…" : "AI: write a reply"}
          </button>
        )}
      </div>

      <div className="max-h-[460px] overflow-y-auto bg-paper/50 px-4 py-4">
        {loadError && <p role="alert" className="text-sm text-signal">{loadError}</p>}
        {!data && !loadError && <p className="text-sm text-muted">Loading texts…</p>}
        {data && sent.length === 0 && <p className="py-6 text-center text-muted">No texts yet.</p>}
        <ol className="grid gap-2.5">
          {sent.map((m) => {
            const mine = m.direction === "out";
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                  <p className={`inline-block whitespace-pre-line rounded-2xl px-3.5 py-2 text-left text-[15px] leading-snug ${
                    mine ? (m.status === "failed" ? "bg-warn-soft text-ink ring-1 ring-signal/30" : "bg-graphite text-white") : "bg-white ring-1 ring-line"}`}>
                    {m.body}
                  </p>
                  <p className="mt-0.5 px-1 text-xs text-muted">
                    {time(m.at)}
                    {mine && (m.ai ? " · AI" : m.sentBy ? ` · ${m.sentBy}` : "")}
                    {mine && m.status === "delivered" && " · Delivered"}
                    {mine && m.status === "failed" && <span className="text-signal"> · Not delivered{m.error ? `: ${m.error}` : ""}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={bottom} />
      </div>

      {draft && draftText !== null && (
        <div className="border-t border-line bg-[#fff8ec] px-5 py-4">
          <p className="text-sm font-semibold">AI reply waiting for you <span className="font-normal text-muted">(change anything, then send)</span></p>
          <textarea className="input mt-2" rows={3} value={draftText} onChange={(e) => setDraftText(e.target.value)} aria-label="AI reply" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-red" disabled={pending || Boolean(blocked)} onClick={() => run(() => sendTextDraftAction(draft.id, customerKey, draftText))}>
              {pending ? "Sending…" : `Send to ${firstName ?? "customer"}`}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => discardTextDraftAction(draft.id))}>Discard</button>
          </div>
        </div>
      )}

      <div className="border-t border-line px-5 py-4">
        {blocked ? <p className="text-sm text-muted">{blocked}</p> : (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(() => sendTextAction(customerKey, text), () => setText("")); }}>
            <label className="min-w-0 flex-1"><span className="sr-only">Text message</span>
              <textarea className="input mt-0" rows={2} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} placeholder={`Text ${firstName ?? "the customer"}…`}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            </label>
            <button type="submit" className="btn btn-primary h-[42px]" disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send"}</button>
          </form>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
