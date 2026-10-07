"use client";
// A line graph with a small circle for every point. Hover (or tap) a circle to see what it is.
// Drawn as plain SVG, sized to its container so the text stays readable on a phone.
import { useEffect, useMemo, useRef, useState } from "react";

export type ChartPoint = { x: number; y: number; tip: string };
export type ChartSeries = { name: string; color: string; points: ChartPoint[] };

// Axis labels are dollars. (Done in here, not passed in as a function, because this chart is drawn from server-rendered pages.)
const shortMoney = (v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? "-" : ""}$${+(Math.abs(v) / 1000).toFixed(1)}k` : `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v * 100) / 100)}`);

function niceStep(range: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(range)));
  const f = range / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

export default function LineChart({ series, xTicks, ariaLabel, emptyText, height = 300, zeroBase = true }: {
  series: ChartSeries[]; xTicks: { x: number; label: string }[]; ariaLabel: string; emptyText: string; height?: number;
  /** Start the up-and-down axis at $0 (sales, profit). Turn off to zoom in on prices that move only a little. */
  zeroBase?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hover, setHover] = useState<{ s: number; p: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setWidth(Math.max(300, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = width < 520 ? Math.min(height, 260) : height;
  const L = 58, R = 16, T = 14, B = 30;
  const all = series.flatMap((s) => s.points);
  const has = all.length > 0;

  const layout = useMemo(() => {
    const ys = all.map((p) => p.y);
    let lo = Math.min(0, ...ys, 0), hi = Math.max(0, ...ys, 0);
    if (!zeroBase && has) {
      const mn = Math.min(...ys), mx = Math.max(...ys);
      const pad = (mx - mn) * 0.25 || Math.max(Math.abs(mx) * 0.03, 1);
      lo = mn - pad; hi = mx + pad;
    } else if (!has || hi === lo) { lo = Math.min(lo, 0); hi = Math.max(hi, 1000); }
    const step = niceStep((hi - lo) / 4);
    const niceLo = Math.floor(lo / step) * step, niceHi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let t = niceLo; t <= niceHi + step / 1000; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
    const xs = [...all.map((p) => p.x), ...xTicks.map((t) => t.x)];
    let xLo = Math.min(...xs), xHi = Math.max(...xs);
    if (!isFinite(xLo)) { xLo = 0; xHi = 1; }
    if (xLo === xHi) { xLo -= 1; xHi += 1; }
    return { ticks, niceLo, niceHi, xLo, xHi };
  }, [all, has, xTicks, zeroBase]);

  const px = (x: number) => L + ((x - layout.xLo) / (layout.xHi - layout.xLo)) * (width - L - R);
  const py = (y: number) => T + (1 - (y - layout.niceLo) / (layout.niceHi - layout.niceLo)) * (H - T - B);

  function move(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: { s: number; p: number } | null = null, bestD = 28 * 28;
    series.forEach((s, si) => s.points.forEach((pt, pi) => {
      const d = (px(pt.x) - mx) ** 2 + (py(pt.y) - my) ** 2;
      if (d < bestD) { bestD = d; best = { s: si, p: pi }; }
    }));
    setHover(best);
  }

  const hp = hover ? series[hover.s].points[hover.p] : null;
  const money = shortMoney;

  return (
    <div ref={box} className="relative w-full">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={ariaLabel} onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={move as unknown as React.MouseEventHandler<SVGSVGElement>} className="block max-w-full touch-manipulation">
        {layout.ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={width - R} y1={py(t)} y2={py(t)} stroke={t === 0 ? "#10233f40" : "#e3e7ed"} />
            <text x={L - 8} y={py(t) + 4} textAnchor="end" fontSize="11" fill="#5d6b7e">{money(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`${t.x}-${t.label}`} x={px(t.x)} y={H - 9} fontSize="11" fill="#5d6b7e"
            textAnchor={px(t.x) < L + 30 ? "start" : px(t.x) > width - R - 30 ? "end" : "middle"}>{t.label}</text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            {s.points.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} />}
            {s.points.map((p, i) => (
              <circle key={i} cx={px(p.x)} cy={py(p.y)} r={hover && hover.s === series.indexOf(s) && hover.p === i ? 6 : 3.6} fill={hover && hover.s === series.indexOf(s) && hover.p === i ? s.color : "#fff"} stroke={s.color} strokeWidth="2">
                <title>{p.tip}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      {!has && <div className="pointer-events-none absolute inset-0 grid place-content-center pb-8 text-center text-sm text-muted">{emptyText}</div>}
      {hp && hover && (
        <div className="pointer-events-none absolute z-10 whitespace-pre-line rounded-lg bg-ink px-3 py-2 text-xs font-semibold leading-snug text-white shadow-lg"
          style={{ left: Math.min(Math.max(px(hp.x), 90), width - 90), top: Math.max(py(hp.y) - 12, 40), transform: "translate(-50%, -100%)" }}>{hp.tip}</div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map((s) => <li key={s.name} className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full border-2 bg-white" style={{ borderColor: s.color }} />{s.name}</li>)}
      </ul>
    </div>
  );
}
