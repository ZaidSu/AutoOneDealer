"use client";

import { useState } from "react";

type Connection = { mailbox: string; connectedAt: number; connectedBy: string } | null;
type Props = { connection: Connection; canManage: boolean; expectedMailbox: string; notice: { tone: "ok" | "error"; text: string } | null };
type Result = { tone: "ok" | "error"; text: string; code?: string } | null;

export default function GmailCard({ connection, canManage, expectedMailbox, notice }: Props) {
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
        </p>
      ) : (
        <p className="mt-2 text-muted">
          Connect {expectedMailbox ? <span className="font-medium text-ink">{expectedMailbox}</span> : "the dealership inbox"} so
          AutoDash can find new customer emails and CarsForSale finance applications. AutoDash only reads email; it can't send
          or delete anything.
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
        <p className="mt-4 text-sm text-muted">Only owners and managers can change the inbox connection.</p>
      )}

      <p className="mt-5 text-xs text-muted">
        For now the connection is saved in this browser only. Shared storage for the whole team comes with the customer database.
      </p>
    </section>
  );
}
