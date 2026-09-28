"use client";
// Stopwatch: records how long each page takes on this computer, split into where the time went,
// so slowness can be fixed where it actually happens. Sends a tiny note after the page is done.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Note = Record<string, string | number | boolean>;
const send = (note: Note) => {
  try { navigator.sendBeacon("/api/perf", JSON.stringify(note)); } catch { /* never get in the way */ }
};
const ms = (n: number) => Math.max(0, Math.round(n));

export default function PerfReporter({ serverHits, serverAgeS }: { serverHits: number; serverAgeS: number }) {
  const pathname = usePathname();
  const clickAt = useRef<number | null>(null);

  // A full page load (refresh or opening AutoDash).
  useEffect(() => {
    const report = () => {
      const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!n) return;
      send({
        route: location.pathname, kind: "refresh",
        connect: ms(n.requestStart - n.startTime),       // reaching Vercel (network, secure connection)
        server: ms(n.responseStart - n.requestStart),    // server starting up + first bytes
        data: ms(n.responseEnd - n.responseStart),       // page content arriving (database work)
        browser: ms(n.loadEventEnd - n.responseEnd),     // browser loading code and drawing the page
        total: ms(n.loadEventEnd - n.startTime),
        cold: serverHits <= 1, serverAgeS,
      });
    };
    if (document.readyState === "complete") setTimeout(report, 0);
    else window.addEventListener("load", () => setTimeout(report, 0), { once: true });

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='/']");
      if (a && !e.metaKey && !e.ctrlKey) clickAt.current = performance.now();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [serverHits, serverAgeS]);

  // Clicking a link inside AutoDash: time from the click until the page's content (not the loading screen) is showing.
  useEffect(() => {
    if (clickAt.current === null) return;
    const start = clickAt.current;
    clickAt.current = null;
    const done = () => {
      if (document.querySelector("[data-page-loading]") && performance.now() - start < 30000) return requestAnimationFrame(done);
      send({ route: pathname, kind: "click", total: ms(performance.now() - start) });
    };
    requestAnimationFrame(done);
  }, [pathname]);

  return null;
}
