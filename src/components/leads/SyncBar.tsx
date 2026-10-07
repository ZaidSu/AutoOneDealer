"use client";
import { notifyChanged } from "@/lib/client/live";
// Shows how fresh the saved leads are, with an "Update now" button.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = { lastRun: number | null; saved: number; remaining: number };

function ago(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.round(hours / 24)} days ago`;
}

export default function SyncBar({ lastRun, saved, remaining }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Keeps importing batch after batch while the page is open, until everything is saved.
  async function update(auto = false) {
    setBusy(true);
    setMessage(auto ? "Importing your lead emails. You can keep using the page…" : null);
    let keepGoing = false;
    try {
      const response = await fetch("/api/leads/sync?force=1", { method: "POST" });
      const data = await response.json().catch(() => null);
      setMessage(data?.message ?? "Couldn't update right now.");
      keepGoing = Boolean(data?.ok && data.remaining > 0);
      // Refresh only when the import is finished; refreshing mid-import could undo a page change.
      if (data?.ok && !keepGoing) { router.refresh(); notifyChanged(); }
    } catch {
      setMessage("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
    if (keepGoing) setTimeout(() => update(true), 1500);
    // (Automatic checks happen in the background; this button is only for "right now".)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" aria-live="polite">
      {busy && <span aria-hidden className="lane-loader inline-block h-1 w-16 rounded-full" />}
      <span>
        {busy
          ? message ?? "Checking Gmail for new leads…"
          : message ?? (lastRun
            ? `Updated ${ago(lastRun)} · ${saved.toLocaleString()} leads saved${remaining > 0 ? ` · importing ${remaining.toLocaleString()} older emails in the background` : " · new leads arrive automatically"}`
            : "Importing your lead emails in the background…")}
      </span>
      {!busy && (
        <button type="button" onClick={() => update()} className="font-semibold text-signal hover:underline">
          {remaining > 0 ? "Import more" : "Update now"}
        </button>
      )}
    </div>
  );
}
