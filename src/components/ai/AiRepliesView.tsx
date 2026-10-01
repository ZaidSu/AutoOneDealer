"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { discardAiReplyAction, draftAiRepliesNowAction, sendAiReplyAction, setAutoSendAction } from "@/app/actions";
import type { AiReply, LeadOutcome } from "@/lib/ai/replies";

type Setup = { ai: boolean; canSend: boolean; gmail: boolean; lastTimer: number | null };
type Msg = { ok: boolean; text: string } | null;

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "");
const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};

export default function AiRepliesView({ drafts: initialDrafts, history, setup, canWriteNow, autoSend, outcomes, lastReport }: { drafts: AiReply[]; history: AiReply[]; setup: Setup; canWriteNow: boolean; autoSend: boolean; outcomes: LeadOutcome[]; lastReport: string | null }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [done, setDone] = useState<AiReply[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const timerOk = setup.lastTimer !== null && Date.now() - setup.lastTimer < 20 * 60_000;

  const writeNow = () => start(async () => {
    const r = await draftAiRepliesNowAction();
    setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    if (r.ok) window.location.reload();
  });

  return (
    <div className="grid gap-8">
      <section aria-label="Setup" className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ul className="grid gap-2 text-[15px]">
            <Check ok={setup.ai} good="AI is connected" bad="AI key missing: add ANTHROPIC_API_KEY in Vercel and redeploy" />
            <Check ok={setup.canSend} good="Gmail can send" bad={setup.gmail ? "Gmail can read but not send yet" : "Gmail isn't connected"}
              action={<Link href="/settings" className="font-semibold text-signal underline">{setup.gmail ? "Reconnect Gmail" : "Connect Gmail"}</Link>} />
            <Check ok={timerOk} good={`Timer running (last check ${setup.lastTimer ? ago(setup.lastTimer) : ""})`}
              bad={setup.lastTimer ? `Timer hasn't run since ${ago(setup.lastTimer)}` : "Timer not set up: replies are only written when you click Write replies now"} />
          </ul>
          {lastReport && <p className="mt-2 text-sm text-muted"><b className="font-semibold text-ink">Last check:</b> {lastReport}</p>}
          {canWriteNow && (
            <div className="flex flex-col items-end gap-1">
              <button type="button" className="btn" disabled={pending || !setup.ai} onClick={writeNow}>{pending ? "Writing…" : "Write replies now"}</button>
              <p className="text-xs text-muted">Normally automatic, Mon to Sat 9 AM to 7 PM</p>
            </div>
          )}
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
        <AutoSendToggle initial={autoSend} canChange={canWriteNow} canSend={setup.canSend} />
      </section>

      <section aria-labelledby="waiting">
        <h2 id="waiting" className="mb-3 text-lg font-semibold">Waiting for you <span className="text-muted">{drafts.length}</span></h2>
        {drafts.length === 0 ? (
          <p className="panel p-5 text-muted">No replies waiting. When a new lead with an email address comes in, the AI&apos;s reply shows up here for you to check.</p>
        ) : (
          <ul className="grid gap-4">
            {drafts.map((d) => (
              <li key={d.id}>
                <Draft reply={d} canSend={setup.canSend}
                  onDone={(r) => { setDrafts((all) => all.filter((x) => x.id !== d.id)); setDone((all) => [r, ...all]); }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-leads">
        <h2 id="recent-leads" className="mb-1 text-lg font-semibold">Recent leads and what the AI did</h2>
        <p className="mb-3 text-sm text-muted">Every lead from the last 2 days, so you can see why one did or didn&apos;t get a reply.</p>
        {outcomes.length === 0 ? <p className="panel p-5 text-muted">No leads in the last 2 days.</p> : (
          <ul className="panel divide-y divide-line">
            {outcomes.map((o) => (
              <li key={o.leadId} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3">
                <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${OUTCOME[o.outcome].cls}`}>{OUTCOME[o.outcome].label}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{o.name || "Name not provided"} <span className="font-normal text-muted">{o.email ?? "no email"}{o.provider ? `, ${o.provider}` : ""}</span></p>
                  <p className="text-sm text-muted">{o.reason}</p>
                </div>
                <span className="text-sm text-muted">{when(o.receivedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-semibold">History</h2>
        {[...done, ...history].length === 0 ? (
          <p className="panel p-5 text-muted">Nothing sent yet.</p>
        ) : (
          <ul className="panel divide-y divide-line">
            {[...done, ...history].map((r) => <HistoryRow key={r.id} reply={r} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function Check({ ok, good, bad, action }: { ok: boolean; good: string; bad: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${ok ? "bg-go" : "bg-lane"}`}>{ok ? "✓" : "!"}</span>
      <span>{ok ? good : bad}{!ok && action && <> {action}</>}</span>
    </li>
  );
}

function Draft({ reply, canSend, onDone }: { reply: AiReply; canSend: boolean; onDone: (r: AiReply) => void }) {
  const [subject, setSubject] = useState(reply.subject);
  const [body, setBody] = useState(reply.body);
  const [msg, setMsg] = useState<Msg>(reply.error ? { ok: false, text: `Last try: ${reply.error}` } : null);
  const [pending, start] = useTransition();

  const send = () => start(async () => {
    const r = await sendAiReplyAction(reply.id, subject, body);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    onDone({ ...reply, subject, body, status: "sent", sentAt: Date.now(), sentBy: "you" });
  });
  const discard = () => {
    if (!window.confirm("Discard this reply? The customer won't get an email from the AI for this lead.")) return;
    start(async () => {
      const r = await discardAiReplyAction(reply.id);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      onDone({ ...reply, status: "discarded" });
    });
  };

  return (
    <article className="panel grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="border-b border-line bg-paper/60 p-5 lg:border-r lg:border-b-0">
        <p className="text-sm text-muted">
          {reply.kind === "reply" && <span className="mr-2 rounded-full bg-go-soft px-2 py-0.5 text-xs font-semibold text-go">Wrote back</span>}
          {when(reply.leadReceivedAt)}{reply.kind === "reply" ? ", replying to your email" : reply.provider ? `, from ${reply.provider}` : ""}
        </p>
        <h3 className="mt-1 text-lg font-semibold">{reply.customerName || "Name not provided"}</h3>
        <p className="text-sm text-muted">{reply.toEmail}</p>
        {reply.vehicle && <p className="mt-2 text-[15px]"><span className="text-muted">Asked about</span> {reply.vehicle}</p>}
        <p className="mt-4 text-sm font-semibold text-muted">They wrote</p>
        <p className="mt-1 whitespace-pre-line text-[15px]">{reply.customerMessage || <span className="text-muted">No message, just the inquiry.</span>}</p>
      </div>
      <div className="p-5">
        <p className="text-sm font-semibold text-muted">The AI&apos;s reply <span className="font-normal">(you can change anything)</span></p>
        <label className="field mt-2">Subject<input className="input" value={subject} onChange={(e) => { setSubject(e.target.value); setMsg(null); }} /></label>
        <label className="field mt-3">Message<textarea className="input" rows={9} value={body} onChange={(e) => { setBody(e.target.value); setMsg(null); }} /></label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-red" disabled={pending || !canSend} onClick={send}
            title={canSend ? undefined : "Reconnect Gmail in Settings to allow sending"}>{pending ? "Sending…" : `Send to ${reply.customerName?.split(" ")[0] || "customer"}`}</button>
          <button type="button" className="btn" disabled={pending} onClick={discard}>Discard</button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
        </div>
      </div>
    </article>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-go-soft text-go" },
  discarded: { label: "Discarded", cls: "bg-paper text-muted ring-1 ring-line" },
  skipped: { label: "Skipped", cls: "bg-paper text-muted ring-1 ring-line" },
  failed: { label: "Failed", cls: "bg-warn-soft text-signal" },
  sending: { label: "Sending", cls: "bg-paper text-muted ring-1 ring-line" },
};

function HistoryRow({ reply }: { reply: AiReply }) {
  const s = STATUS[reply.status] ?? STATUS.skipped;
  return (
    <li>
      <details className="group px-5 py-3">
        <summary className="flex list-none flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
          <span className="font-semibold">{reply.customerName || reply.toEmail}</span>
          <span className="min-w-0 flex-1 truncate text-muted">{reply.status === "skipped" ? reply.error : reply.subject}</span>
          <span className="text-sm text-muted">{when(reply.sentAt ?? reply.createdAt)}{reply.sentBy ? `, by ${reply.sentBy}` : ""}</span>
        </summary>
        {reply.status !== "skipped" && (
          <div className="mt-3 grid gap-4 border-t border-line pt-3 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-muted">They wrote</p>
              <p className="mt-1 whitespace-pre-line text-[15px]">{reply.customerMessage || "No message, just the inquiry."}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-muted">{reply.status === "sent" ? `Sent to ${reply.toEmail}` : "The AI wrote"}</p>
              <p className="mt-1 font-semibold">{reply.subject}</p>
              <p className="mt-1 whitespace-pre-line text-[15px]">{reply.body}</p>
            </div>
          </div>
        )}
      </details>
    </li>
  );
}

/** On: the AI sends its replies by itself (during AI hours). Off: it only writes drafts for a person to send. */
function AutoSendToggle({ initial, canChange, canSend }: { initial: boolean; canChange: boolean; canSend: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !on;
    if (next && !window.confirm("Turn on automatic sending? The AI will email new leads by itself, Mon to Sat 9 AM to 7 PM, without anyone checking first. Everything it sends is listed below.")) return;
    start(async () => {
      const r = await setAutoSendAction(next);
      if (r.ok) setOn(next);
      setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
    });
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
      <button type="button" role="switch" aria-checked={on} aria-label="Automatic sending" disabled={!canChange || pending} onClick={flip}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-graphite-3/30"} disabled:opacity-60`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Automatic sending is {on ? "on" : "off"}</p>
        <p className="text-sm text-muted">
          {on ? "The AI sends its replies by itself during AI hours. Turn off to review each one first."
            : "The AI writes drafts; someone on your team checks each one and clicks Send."}
          {on && !canSend ? " Gmail can't send yet, so replies wait as drafts until you reconnect Gmail." : ""}
        </p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}

const OUTCOME: Record<LeadOutcome["outcome"], { label: string; cls: string }> = {
  drafted: { label: "Reply ready", cls: "bg-[#fff3d6] text-[#8a5300]" },
  sent: { label: "Replied", cls: "bg-go-soft text-go" },
  skipped: { label: "Skipped", cls: "bg-paper text-muted ring-1 ring-line" },
  discarded: { label: "Discarded", cls: "bg-paper text-muted ring-1 ring-line" },
  no_email: { label: "No email", cls: "bg-paper text-muted ring-1 ring-line" },
  waiting: { label: "Waiting", cls: "bg-[#e7f0ff] text-[#1c56c4]" },
};
