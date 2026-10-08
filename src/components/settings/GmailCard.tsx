"use client";

import { useState } from "react";

type Connection = { mailbox: string; connectedAt: number; connectedBy: string } | null;
type Props = { connection: Connection; canManage: boolean; expectedMailbox: string; notice: { tone: "ok" | "error"; text: string } | null; shared: boolean; canSend?: boolean; canMarkRead?: boolean };
type Result = { tone: "ok" | "error"; text: string; code?: string } | null;

export default function GmailCard({ connection, canManage, expectedMailbox, notice, shared, canSend = false, canMarkRead = true }: Props) {
  const [busy, setBusy] = useState<"test" | "disconnect" | null>(null);
  const [result, setResult] = useState<Result>(notice);
  const [connected, setConnected] = useState(connection);

  async function call(action: "test" | "disconnect") {
    if (action === "disconnect" && !window.confirm("Disconnect the dealership inbox? AutoDash will stop reading new emails.")) return;
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch(`/api/integrations/gmail/${action}`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      setResult({ tone: data.ok ? "ok" : "error", text: data.message ?? "Something went wrong. Try again.", code: data.code });
      if (action === "disconnect" && data.ok) setConnected(null);
    } catch {
      setResult({ tone: "error", text: "Couldn't reach AutoDash. Check your internet connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  const button = "inline-flex h-10 items-center rounded-md px-4 font-semibold transition-colors disabled:opacity-60";

  return (
    <section aria-labelledby="gmail-heading" className="rounded-lg border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="gmail-heading" className="text-lg font-semibold">Gmail</h2>
        <span
          className={`rounded-full px-3 py-0.5 text-sm font-medium ${
            connected ? "bg-go-soft text-go" : "bg-paper text-muted ring-1 ring-line"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {connected ? (
        <p className="mt-2 text-muted">
          Reading <span className="font-medium text-ink">{connected.mailbox}</span>. Connected by {connected.connectedBy} on{" "}
          {new Date(connected.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
          {canSend ? " It can also send the AI replies you approve." : ""}
        </p>
      ) : null}
      {connected && !canSend ? (
        <p className="mt-3 rounded-lg border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-sm">
          <span className="font-semibold">Reconnect Gmail to turn on AI email replies.</span> AutoDash can read this inbox but doesn&apos;t
          have permission to send yet. Click Reconnect Gmail and allow sending. It only sends replies someone approves; it can&apos;t delete anything.
        </p>
      ) : null}
      {connected && canSend && !canMarkRead ? (
        <p className="mt-3 rounded-lg border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-sm">
          <span className="font-semibold">Reconnect Gmail so AutoDash can mark handled emails as read.</span> It can read and send now, but doesn&apos;t
          have permission to mark the lead emails and customer replies it has handled as read yet. Click Reconnect Gmail and allow it. It never deletes or moves mail.
        </p>
      ) : null}
      {!connected && (
        <p className="mt-2 text-muted">
          Connect {expectedMailbox ? <span className="font-medium text-ink">{expectedMailbox}</span> : "the dealership inbox"} so
          AutoDash can find new customer emails and CarsForSale finance applications. AutoDash reads email and sends only the
          AI replies someone approves. It can't delete anything.
        </p>
      )}

      {result && (
        <p
          role={result.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-md px-4 py-3 text-sm ${
            result.tone === "ok" ? "bg-go-soft text-go" : "border border-signal/25 bg-warn-soft text-ink"
          }`}
        >
          {result.text}
          {result.code && <span className="mt-1 block text-xs text-muted">Error code: {result.code}</span>}
        </p>
      )}

      {canManage ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {connected ? (
            <>
              <button type="button" onClick={() => call("test")} disabled={busy !== null} className={`${button} bg-graphite text-white hover:bg-graphite-3`}>
                {busy === "test" ? "Testing…" : "Test connection"}
              </button>
              <a href="/api/integrations/gmail/connect" className={`${button} ring-1 ring-line hover:bg-paper`}>
                Reconnect Gmail
              </a>
              <button type="button" onClick={() => call("disconnect")} disabled={busy !== null} className={`${button} text-signal hover:bg-warn-soft`}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <a href="/api/integrations/gmail/connect" className={`${button} bg-signal text-white hover:bg-signal-dark`}>
              Connect Gmail
            </a>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Only owners, managers and the developer can change the inbox connection.</p>
      )}

      <p className="mt-5 text-xs text-muted">
        {shared
          ? "The connection is saved in the shared database, so everyone on the team sees the same inbox on any device."
          : "For now the connection is saved in this browser only. It becomes shared with the whole team once the database is connected."}
      </p>
    </section>
  );
}
