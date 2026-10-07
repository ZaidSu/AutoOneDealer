"use client";

import { useEffect, useRef, useState } from "react";

// Informational only. Real protection is the server-side role check on the page and its APIs.
export default function DeveloperNotice() {
  const [open, setOpen] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-notice-title"
        className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-xl leading-none text-muted hover:bg-paper hover:text-ink"
        >
          ×
        </button>
        <h2 id="dev-notice-title" className="pr-8 text-xl font-semibold">This page is meant for a developer</h2>
        <p className="mt-2 text-muted">
          It shows technical setup details. Nothing here is needed for everyday work, and changing settings based on it can
          break the dealership's connections.
        </p>
      </div>
    </div>
  );
}
