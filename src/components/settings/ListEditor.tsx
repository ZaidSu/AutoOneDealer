"use client";
// Add / remove list used for the sales team and lead sources in Settings.
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

type Item = { id: number; name: string };
type Props = {
  title: string;
  description: string;
  items: Item[];
  addLabel: string;
  placeholder: string;
  canEdit: boolean;
  confirmRemove: (name: string) => string;
  onAdd: (name: string) => Promise<ActionResult>;
  onRemove: (id: number) => Promise<ActionResult>;
};

export default function ListEditor({ title, description, items, addLabel, placeholder, canEdit, confirmRemove, onAdd, onRemove }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    if (!name.trim()) return setError("Enter a name first.");
    start(async () => {
      const result = await onAdd(name);
      if (result.ok) { setName(""); setError(null); } else setError(result.error);
    });
  }

  function remove(item: Item) {
    if (!window.confirm(confirmRemove(item.name))) return;
    start(async () => {
      const result = await onRemove(item.id);
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-muted">{description}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-1 rounded-full bg-paper py-1 pl-3 pr-1 text-[15px] ring-1 ring-line">
            {item.name}
            {canEdit && (
              <button type="button" onClick={() => remove(item)} disabled={pending} aria-label={`Remove ${item.name}`}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-white hover:text-signal">×</button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-muted">Nothing added yet.</li>}
      </ul>
      {canEdit && (
        <div className="mt-4 flex max-w-md gap-2">
          <label className="sr-only" htmlFor={`add-${title}`}>{addLabel}</label>
          <input id={`add-${title}`} value={name} onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder}
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[15px]" />
          <button type="button" onClick={add} disabled={pending}
            className="h-10 rounded-md bg-graphite px-4 font-semibold text-white hover:bg-graphite-3 disabled:opacity-60">{addLabel}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-signal">{error}</p>}
    </section>
  );
}
