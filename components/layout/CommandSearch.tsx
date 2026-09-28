"use client";
// Find any customer from any page: click the search box or press Ctrl+K (⌘K on a Mac).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { displayName, formatPhone } from "@/lib/format";
import Icon from "./Icon";

type Hit = { key: string; name: string | null; phone: string | null; email: string | null; vehicle: string | null; status: string };

export default function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); else { setQ(""); setHits([]); } }, [open]);

  // Ask the server 150 ms after typing stops; ignore answers to older searches.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }).then((r) => r.json())
        .then((d) => { setHits(d.hits ?? []); setActive(0); }).catch(() => undefined).finally(() => setLoading(false));
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);

  function go(hit?: Hit) {
    if (!hit) { if (q.trim()) router.push(`/customers?q=${encodeURIComponent(q.trim())}`); setOpen(false); return; }
    router.push(`/customers/${hit.key}`);
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg bg-white px-3 text-left text-muted ring-1 ring-line hover:text-ink">
        <Icon name="search" />
        <span className="flex-1 truncate">Find a customer</span>
        <kbd className="hidden rounded border border-line px-1.5 text-xs sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal aria-label="Find a customer" className="card toast w-full max-w-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Icon name="search" className="size-5 text-muted" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email or car"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") go(hits[active]);
                }}
                className="h-14 flex-1 bg-transparent text-[17px] outline-none" aria-label="Search customers" />
              {loading && <span aria-hidden className="lane-loader h-1 w-10 rounded-full" />}
            </div>
            <ul role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li key={h.key} role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                    className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left ${i === active ? "bg-paper" : ""}`}>
                    <span className="font-semibold">{displayName(h.name)}</span>
                    <span className="truncate text-sm text-muted">{[h.phone && formatPhone(h.phone), h.vehicle].filter(Boolean).join(", ")}</span>
                  </button>
                </li>
              ))}
              {q.trim().length >= 2 && !loading && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">No customer matches “{q}”.</li>}
              {q.trim().length < 2 && <li className="px-4 py-3 text-sm text-muted">Type at least two letters or three digits.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
