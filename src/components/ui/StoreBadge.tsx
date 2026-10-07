import { storeStyle } from "@/lib/stores";

// The store in its own colors (Walmart blue, Amazon orange, Best Buy blue and yellow, Target red). Other stores show in gray.
export default function StoreBadge({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-faint">{"\u2014"}</span>;
  const s = storeStyle(name);
  return <span className="badge" style={s ? { background: s.bg, color: s.fg } : undefined}>{s?.name ?? name}</span>;
}
