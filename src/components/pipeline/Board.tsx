"use client";
import SourceBadge from "@/components/leads/SourceBadge";
import { notifyChanged } from "@/lib/client/live";
// Customers by stage. Drag a card to another column (or use its menu on a phone) to change the stage.
import Link from "next/link";
import { useState, useTransition } from "react";
import { updateCustomerAction } from "@/app/actions";
import type { PipelineCard, PipelineColumn } from "@/lib/crm/queries";
import type { Status } from "@/lib/db/data";
import { displayName } from "@/lib/utils/format";

type Props = { columns: PipelineColumn[]; labels: Record<string, string>; repId: number | null };

function ago(ms: number) {
  const days = Math.floor((Date.now() - ms) / 86400000);
  return days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default function Board({ columns: initial, labels, repId }: Props) {
  const [columns, setColumns] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function move(card: PipelineCard, from: Status, to: Status) {
    if (from === to) return;
    const before = columns;
    setColumns((cols) => cols.map((c) =>
      c.status === from ? { ...c, count: c.count - 1, cards: c.cards.filter((x) => x.key !== card.key) }
      : c.status === to ? { ...c, count: c.count + 1, cards: [card, ...c.cards] } : c));
    start(async () => {
      const r = await updateCustomerAction(card.key, card.name, "status", to);
      if (!r.ok) { setColumns(before); setError(r.error); } else notifyChanged();
    });
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-signal">{error}</p>}
      <div className="board">
        {columns.map((col) => (
          <section key={col.status} aria-label={labels[col.status]}
            className={`board-col ${over === col.status ? "is-over" : ""}`} data-status={col.status}
            onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={(e) => {
              e.preventDefault(); setOver(null);
              const [key, from] = e.dataTransfer.getData("text/plain").split("|");
              const card = columns.find((c) => c.status === from)?.cards.find((x) => x.key === key);
              if (card) move(card, from as Status, col.status);
            }}>
            <header className="board-head">
              <h2>{labels[col.status]}</h2>
              <span className="tabular-nums">{col.count.toLocaleString()}</span>
            </header>
            <ul className="board-list">
              {col.cards.map((card) => (
                <li key={card.key} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${card.key}|${col.status}`); setDragging(card.key); }}
                  onDragEnd={() => setDragging(null)} className={`board-card ${dragging === card.key ? "opacity-50" : ""}`}>
                  <Link href={`/customers/${card.key}`} className="block font-semibold hover:text-signal">{displayName(card.name)}</Link>
                  <p className="truncate text-sm text-muted">{card.vehicle ?? "No vehicle mentioned"}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <SourceBadge source={card.source} size="sm" />
                    <span>{ago(card.lastSeen)}</span>
                    {card.repName && <span className="font-semibold text-ink">{card.repName}</span>}
                    {card.hasApplication && <span className="font-semibold text-signal">Loan app</span>}
                  </p>
                  <label className="mt-2 block lg:hidden">
                    <span className="sr-only">Move to</span>
                    <select value={col.status} onChange={(e) => move(card, col.status, e.target.value as Status)} className="h-8 w-full rounded border border-line bg-white px-2 text-sm">
                      {columns.map((c) => <option key={c.status} value={c.status}>{labels[c.status]}</option>)}
                    </select>
                  </label>
                </li>
              ))}
              {col.cards.length === 0 && <li className="board-empty">Nobody here.</li>}
            </ul>
            {col.count > col.cards.length && (
              <Link href={`/customers?status=${col.status}${repId ? `&rep=${repId}` : ""}`} className="board-more">See all {col.count.toLocaleString()}</Link>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
