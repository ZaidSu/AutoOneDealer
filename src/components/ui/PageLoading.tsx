"use client";
// Shown while a page gathers its data. Messages change every couple of seconds so the wait feels alive.
import { useEffect, useState } from "react";

export default function PageLoading({ title, messages, rows = 6 }: { title: string; messages: string[]; rows?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, messages.length - 1)), 2200);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div data-page-loading aria-busy="true">
      <header className="mb-7 max-w-3xl">
        <h1 className="page-title">{title}</h1>
        <p key={index} className="loading-message mt-1.5 text-muted" role="status" aria-live="polite">{messages[index]}</p>
      </header>
      <div aria-hidden className="lane-loader mb-6 h-1.5 w-full max-w-3xl rounded-full opacity-90" />
      <ul aria-hidden className="max-w-5xl divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-4">
            <span className="skeleton h-4 rounded bg-paper" style={{ width: `${28 + ((i * 37) % 30)}%`, animationDelay: `${i * 120}ms` }} />
            <span className="skeleton ml-auto h-4 w-24 rounded bg-paper" style={{ animationDelay: `${i * 120 + 60}ms` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
