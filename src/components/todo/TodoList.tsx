"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { todoDoneAction, todoSnoozeAction } from "@/app/actions";
import { notifyChanged } from "@/lib/client/live";
import { bucket, stateKey, type TodoRow } from "@/lib/crm/todo-rules";
import { displayName, formatPhone } from "@/lib/utils/format";

const SECTIONS = [
  { id: "now", title: "Do first", note: "Customers waiting on you, and reminders that are due." },
  { id: "today", title: "Today", note: "Applications, new leads and today's appointments." },
  { id: "later", title: "When you can", note: "Tomorrow's appointments and recent no-shows." },
] as const;

const CHIP: Record<string, string> = {
  replied: "bg-[#e7f5ff] text-[#1864ab]", callback: "bg-[#fff3d6] text-[#8a5300]", application: "bg-[#fff0e0] text-[#a14a00]",
  new_lead: "bg-[#f3f0ff] text-[#5f3dc4]", appointment: "bg-go-soft text-go", no_show: "bg-warn-soft text-signal",
};

export default function TodoList({ rows: initial }: { rows: TodoRow[] }) {
  const [rows, setRows] = useState(initial);
  const router = useRouter();
  const remove = (id: string) => { setRows((all) => all.filter((r) => r.id !== id)); router.refresh(); notifyChanged(); };

  if (rows.length === 0) {
    return <p className="panel p-8 text-center text-lg text-muted">You&apos;re all caught up. Nothing needs you right now.</p>;
  }
  return (
    <div className="grid gap-8">
      {SECTIONS.map((section) => {
        const items = rows.filter((r) => bucket(r.weight) === section.id);
        if (items.length === 0) return null;
        return (
          <section key={section.id} aria-labelledby={`todo-${section.id}`}>
            <h2 id={`todo-${section.id}`} className="text-lg font-semibold">{section.title} <span className="text-muted">{items.length}</span></h2>
            <p className="mb-3 text-sm text-muted">{section.note}</p>
            <ul className="panel divide-y divide-line">
              {items.map((row) => <TodoItem key={row.id} row={row} onGone={() => remove(row.id)} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TodoItem({ row, onGone }: { row: TodoRow; onGone: () => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const keys = row.reasons.map((r) => stateKey(row.id, r.reason, r.token));
  const href = row.customerKey ? `/customers/${encodeURIComponent(row.customerKey)}` : "/appointments";
  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await work();
    if (r.ok) onGone(); else setError(r.error ?? "Couldn't save that.");
  });
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex flex-wrap items-center gap-x-2 text-[17px] font-semibold">
            <Link href={href} className="hover:text-signal hover:underline">{displayName(row.name) || (row.phone ? formatPhone(row.phone) : "Customer")}</Link>
            {row.vehicle && <span className="text-[15px] font-normal text-muted">{row.vehicle}</span>}
          </p>
          <ul className="mt-1.5 grid gap-1.5">
            {row.reasons.map((r) => (
              <li key={r.reason + r.token} className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[r.reason] ?? ""}`}>{r.hot ? "Ready to move" : r.label}</span>
                <span className="min-w-0 flex-1 basis-60 text-ink">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.phone && <a href={`tel:${row.phone}`} className="btn btn-red">Call {formatPhone(row.phone)}</a>}
          <Link href={href} className="btn">Open</Link>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => todoDoneAction(keys, row.customerKey, row.name))}>{pending ? "…" : "Done"}</button>
          <label className="sr-only" htmlFor={`snooze-${row.id}`}>Snooze</label>
          <select id={`snooze-${row.id}`} defaultValue="" disabled={pending} className="h-10 rounded-md border border-line bg-white px-2 text-[15px] text-muted"
            onChange={(e) => { const d = Number(e.target.value); if (d) run(() => todoSnoozeAction(keys, d)); }}>
            <option value="" disabled>Snooze…</option>
            <option value="1">Until tomorrow</option>
            <option value="3">3 days</option>
            <option value="7">A week</option>
          </select>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-signal">{error}</p>}
    </li>
  );
}
