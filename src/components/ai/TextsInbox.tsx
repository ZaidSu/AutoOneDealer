"use client";
// The Text conversations page: the list of conversations on the left; click one and its messages open on the right,
// on the same page (on a phone the list is replaced by the messages, with a Back button).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TextThread from "@/components/customers/TextThread";

export type InboxRow = { key: string; customerKey: string | null; phone: string; name: string | null; label: string; preview: string; when: string; waiting: boolean; unread: boolean };

// Each person gets a steady color so the list is quick to scan.
const COLORS = ["#2f6fed", "#0ca678", "#e8590c", "#7048e8", "#d6336c", "#1098ad", "#c8102e", "#5c940d"];
const colorFor = (s: string) => COLORS[[...s].reduce((n, ch) => n + ch.charCodeAt(0), 0) % COLORS.length];

export default function TextsInbox({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);

  // Wide screens open the first conversation straight away, like a messaging app.
  useEffect(() => {
    if (picked || !window.matchMedia("(min-width: 1024px)").matches) return;
    const first = rows.find((r) => r.customerKey);
    if (first) setPicked(first.key);
  }, [rows, picked]);
  // New texts show up on their own.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [router]);

  const current = rows.find((r) => r.key === picked) ?? null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
      <ul className={`panel max-h-[78vh] divide-y divide-line overflow-y-auto ${current ? "hidden lg:block" : ""}`} aria-label="Conversations">
        {rows.map((r) => {
          const on = r.key === picked;
          const c = colorFor(r.key);
          return (
            <li key={r.key}>
              <button type="button" onClick={() => setPicked(r.key)} aria-current={on ? "true" : undefined}
                className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${on ? "bg-[#eef3ff]" : "hover:bg-paper/70"}`}>
                {on && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-signal" />}
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: c }}>{(r.name ?? "#").slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate ${r.unread ? "font-bold" : "font-semibold"}`}>{r.label}</span>
                    {r.waiting && <span className="shrink-0 rounded-full bg-[#fff1d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5300]">AI draft</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">{r.preview}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                  <span>{r.when}</span>
                  {r.unread && <span aria-label="Customer is waiting" className="size-2.5 rounded-full bg-signal" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={current ? "" : "hidden lg:block"}>
        {!current ? (
          <div className="panel grid min-h-[320px] place-items-center p-8 text-center text-muted">Pick a conversation on the left to read it and reply.</div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <button type="button" className="btn btn-sm lg:hidden" onClick={() => setPicked(null)}>← Back</button>
              {current.customerKey && <Link href={`/customers/${encodeURIComponent(current.customerKey)}`} className="panel-link ml-auto">Open {current.name ?? "customer"} →</Link>}
            </div>
            {current.customerKey
              ? <TextThread key={current.customerKey} customerKey={current.customerKey} firstName={current.name ? current.name.trim().split(/\s+/)[0] : null} className="panel overflow-hidden" tall />
              : <div className="panel p-6 text-muted">This number isn&apos;t linked to a customer yet, so its messages can&apos;t be opened here.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
