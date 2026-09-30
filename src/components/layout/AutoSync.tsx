"use client";
import { notifyChanged } from "@/lib/client/live";
// Keeps saved leads up to date while AutoDash is open anywhere, with no buttons.
// About once a minute it asks the server to check Gmail for new leads (one small request);
// during the first-time import it keeps going batch after batch.
// New leads never refresh the page by surprise: a small notice offers to show them.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 60 * 1000;
const WHILE_IMPORTING_MS = 3000;

export default function AutoSync() {
  const router = useRouter();
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (stopped) return;
      let next = EVERY_MS;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/leads/sync", { method: "POST" });
          const data = await response.json().catch(() => null);
          if (data?.ok && data.remaining > 0) next = WHILE_IMPORTING_MS;
          // Only brand-new leads get the notice, not the older emails being imported.
          if (data?.ok && data.saved > 0 && !(data.remaining > 0)) setFresh((n) => n + data.saved);
        } catch {
          // Offline or a hiccup: try again later.
        }
      }
      timer = setTimeout(tick, next);
    }
    // Do not compete with the first page render/cold database connection. After this, the normal
    // once-a-minute cadence is unchanged.
    timer = setTimeout(tick, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") { clearTimeout(timer); timer = setTimeout(tick, 1000); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!fresh) return null;
  return (
    <div role="status" className="toast fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-lg bg-graphite py-2.5 pr-2.5 pl-4 text-white shadow-xl">
      <span>{fresh === 1 ? "1 new lead came in" : `${fresh} new leads came in`}</span>
      <button type="button" onClick={() => { setFresh(0); router.refresh(); notifyChanged(); }} className="rounded-md bg-signal px-3 py-1.5 text-sm font-semibold hover:bg-signal-dark">Show</button>
      <button type="button" onClick={() => setFresh(0)} aria-label="Dismiss" className="rounded-md px-2 py-1.5 text-white/60 hover:text-white">✕</button>
    </div>
  );
}
