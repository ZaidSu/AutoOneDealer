"use client";
// Keeps saved leads up to date automatically while AutoDash is open anywhere, with no buttons.
// Every few minutes it asks the server to check Gmail for new leads; during the first import it
// keeps going batch after batch. The server makes sure only one check runs at a time.
import { useEffect } from "react";

const EVERY_MS = 3 * 60 * 1000;
const WHILE_IMPORTING_MS = 4000;

export default function AutoSync() {
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
          if (data?.ok && data.saved > 0) window.dispatchEvent(new CustomEvent("autodash:leads-synced", { detail: data }));
        } catch {
          // Offline or a hiccup: just try again later.
        }
      }
      timer = setTimeout(tick, next);
    }

    timer = setTimeout(tick, 5000); // let the page finish loading first
    const onVisible = () => {
      if (document.visibilityState === "visible") { clearTimeout(timer); timer = setTimeout(tick, 1000); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return null;
}
