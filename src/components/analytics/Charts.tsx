// Simple, readable charts drawn with plain HTML so they're fast and work on any screen.

export function BarList({ items, emptyText, highlightFirst = true, colorFor }: {
  items: { label: string; value: number; note?: string }[]; emptyText: string; highlightFirst?: boolean;
  /** Gives each row its own color (lead sources); otherwise the first row is red and the rest gray. */
  colorFor?: (label: string) => string;
}) {
  if (items.length === 0 || items.every((i) => i.value === 0)) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={item.label} className="grid grid-cols-[minmax(90px,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[15px]">
          <span className="flex min-w-0 items-center gap-2" title={item.label}>
            {colorFor && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(item.label) }} />}
            <span className="truncate">{item.label}</span>
          </span>
          <span className="h-5 overflow-hidden rounded-sm bg-paper" aria-hidden>
            <span className={`block h-full rounded-sm ${colorFor ? "" : index === 0 && highlightFirst ? "bg-signal" : "bg-graphite-3"}`}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: colorFor ? colorFor(item.label) : undefined }} />
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

export function Columns({ items, emptyText, color = "#4c6ef5", highlightLast = false }: { items: { label: string; value: number }[]; emptyText: string; color?: string; highlightLast?: boolean }) {
  if (items.every((i) => i.value === 0)) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const showEvery = Math.ceil(items.length / 10);
  return (
    <div className="overflow-x-auto">
      <div className="flex h-44 min-w-[320px] items-end gap-1" role="img"
        aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
        {items.map((item, i) => {
          const last = highlightLast && i === items.length - 1;
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.label}: ${item.value}`}>
              <span className={`text-[11px] tabular-nums ${last ? "font-semibold text-signal" : "text-muted"}`}>{item.value || ""}</span>
              <span className="w-full rounded-t-md" style={{ height: `${(item.value / max) * 100}%`, minHeight: item.value ? 3 : 0, background: last ? "var(--color-signal)" : color, opacity: last ? 1 : 0.85 }} />
            </div>
          );
        })}
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
    <section className={`rounded-xl border border-line bg-white p-5 sm:p-6 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
      <p className="mt-4 text-xs text-muted">{note}</p>
    </section>
  );
}

export function Stat({ value, label, color, sub }: { value: number | string; label: string; color?: string; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-white p-5">
      {color && <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />}
      <p className="font-condensed text-4xl font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</p>
      <p className="mt-1 text-[15px] font-medium">{label}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}

/** One bar split into colored parts (like in state / out of state), with a legend showing counts and shares. */
export function SplitBar({ parts, emptyText }: { parts: { label: string; value: number; color: string }[]; emptyText: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <p className="text-sm text-muted">{emptyText}</p>;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded-lg" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value} (${pct(p.value)}%)`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} className="flex h-full items-center justify-center text-sm font-semibold text-white" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`}>
            {pct(p.value) >= 12 ? `${pct(p.value)}%` : ""}
          </span>
        ))}
      </div>
      <ul className="mt-4 grid gap-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2.5 text-[15px]">
            <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: p.color }} />
            <span className="flex-1">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.value.toLocaleString()}</span>
            <span className="w-11 text-right text-sm tabular-nums text-muted">{pct(p.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Warm and varied, but never Texas blue, so out-of-state never looks like in-state.
const STATE_COLORS = ["#f08c00", "#7048e8", "#0ca678", "#e64980", "#e8590c", "#fab005", "#5c940d", "#d6336c", "#15aabf", "#ae3ec9"];
/** A steady color per state name, for the out-of-state chart. */
export function stateColor(name: string): string {
  if (/not given/i.test(name)) return "#ced4da";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STATE_COLORS[h % STATE_COLORS.length];
}
