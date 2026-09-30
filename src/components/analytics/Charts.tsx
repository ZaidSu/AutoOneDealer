// Simple, readable charts drawn with plain HTML so they're fast and work on any screen.

export function BarList({ items, emptyText, highlightFirst = true }: { items: { label: string; value: number; note?: string }[]; emptyText: string; highlightFirst?: boolean }) {
  if (items.length === 0 || items.every((i) => i.value === 0)) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={item.label} className="grid grid-cols-[minmax(90px,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[15px]">
          <span className="truncate" title={item.label}>{item.label}</span>
          <span className="h-5 overflow-hidden rounded-sm bg-paper" aria-hidden>
            <span className={`block h-full rounded-sm ${index === 0 && highlightFirst ? "bg-signal" : "bg-graphite-3"}`}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold">{item.value}</span>
            {item.note && <span className="ml-1.5 text-sm text-muted">{item.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Columns({ items, emptyText }: { items: { label: string; value: number }[]; emptyText: string }) {
  if (items.every((i) => i.value === 0)) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const showEvery = Math.ceil(items.length / 10);
  return (
    <div className="overflow-x-auto">
      <div className="flex h-44 min-w-[320px] items-end gap-1" role="img"
        aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
        {items.map((item) => (
          <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.label}: ${item.value}`}>
            <span className="text-[11px] tabular-nums text-muted">{item.value || ""}</span>
            <span className="w-full rounded-t-sm bg-graphite-3" style={{ height: `${(item.value / max) * 100}%`, minHeight: item.value ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex min-w-[320px] gap-1">
        {items.map((item, i) => (
          <span key={item.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">{i % showEvery === 0 ? item.label : ""}</span>
        ))}
      </div>
    </div>
  );
}

export function Panel({ title, note, children, wide }: { title: string; note: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-lg border border-line bg-white p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
      <p className="mt-4 text-xs text-muted">{note}</p>
    </section>
  );
}

export function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-white p-5">
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
