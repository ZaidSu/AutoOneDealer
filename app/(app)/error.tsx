"use client";
// Shown instead of a crash when a page fails or takes too long to load.
import { useEffect, useRef } from "react";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const retried = useRef(false);
  useEffect(() => {
    console.error("Page failed:", error.digest ?? error.message);
    // A connection dropped mid-load (React error 412) is usually a blip: try once more by itself.
    if (!retried.current && /412|connection closed|failed to fetch|network/i.test(error.message)) {
      retried.current = true;
      const t = setTimeout(reset, 600);
      return () => clearTimeout(t);
    }
  }, [error, reset]);
  return (
    <section className="max-w-2xl rounded-lg border border-line bg-white p-6">
      <h1 className="text-xl font-semibold">This page didn&apos;t finish loading</h1>
      <p className="mt-1 text-muted">
        It took too long or lost its connection. Nothing was lost. Try again, and if it keeps happening, check the Developer page.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={reset} className="inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark">
          Try again
        </button>
        <a href="/developer" className="text-sm font-semibold text-muted hover:text-ink">Developer page</a>
      </div>
      {error.digest && <p className="mt-4 text-xs text-muted">Error code: {error.digest}</p>}
    </section>
  );
}
