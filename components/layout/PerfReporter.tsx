"use client";
// Stopwatch: records how long each page takes on this computer, split into browser/network phases.
// With Next.js streaming, "stream" can include server rendering/database work after the first byte.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Note = Record<string, string | number | boolean>;
const send = (note: Note) => {
  try { navigator.sendBeacon("/api/perf", JSON.stringify(note)); } catch { /* never get in the way */ }
};
const ms = (n: number) => Math.max(0, Math.round(n));

export default function PerfReporter({ serverHits = 2, serverAgeS = 0, startup = "" }: { serverHits?: number; serverAgeS?: number; startup?: string }) {
  const pathname = usePathname();
  const clickAt = useRef<number | null>(null);

  // A full page load (refresh or opening AutoDash).
  useEffect(() => {
    const report = () => {
      const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!n) return;
      send({
        route: location.pathname, kind: "refresh",
        connect: ms(n.requestStart - n.startTime),          // browser -> Vercel request setup
        server: ms(n.responseStart - n.requestStart),       // request -> first byte (TTFB)
        data: ms(n.responseEnd - n.responseStart),          // streamed response after first byte
        browser: ms(n.loadEventEnd - n.responseEnd),        // finishing scripts/resources and load event
        total: ms(n.loadEventEnd - n.startTime),
        cold: serverHits <= 1, serverAgeS,
        detail: startup, // on a newly started server: how long each step of reaching the database took
      });
    };
    if (document.readyState === "complete") setTimeout(report, 0);
    else window.addEventListener("load", () => setTimeout(report, 0), { once: true });

    const onClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='/']") as HTMLAnchorElement | null;
      if (!a) return;
      // Do not start a timer for the already-open page. Previously that stale timer could survive for
      // minutes and make the next navigation look hundreds of seconds slow.
      const target = new URL(a.href, location.href);
      if (target.pathname === location.pathname && target.search === location.search) return;
      clickAt.current = performance.now();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [serverHits, serverAgeS, startup]);

  // Clicking a link inside AutoDash: time from the click until the destination's real content is showing.
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
