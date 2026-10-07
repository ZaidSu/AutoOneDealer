import { Stat } from "@/components/analytics/Charts";

/** A row of numbers: what the AI did over the last 30 days. */
export default function ChannelSummary({ title, note, stats, reasons }: { title: string; note: string; stats: { label: string; value: number; color?: string; sub?: string }[]; reasons?: { reason: string; n: number }[] }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{note}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} color={s.color} sub={s.sub} />)}
      </div>
      {reasons && reasons.length > 0 && (
        <div className="panel mt-3 p-4">
          <p className="text-sm font-semibold text-muted">Why some were skipped or discarded</p>
          <ul className="mt-2 grid gap-1 text-[15px]">
            {reasons.map((r) => <li key={r.reason} className="flex justify-between gap-4"><span>{r.reason}</span><span className="tabular-nums text-muted">{r.n}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
