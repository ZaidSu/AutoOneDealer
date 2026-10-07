"use client";
// The yearly bar graph. Three views: profit, sales vs spend, units. Drawn with plain HTML so it's fast and works on any screen.
import { useState } from "react";
import type { MonthRow } from "@/lib/calc";
import { money, num } from "@/lib/calc";

type Mode = "profit" | "money" | "units";
const SERIES: Record<Mode, (keyof Omit<MonthRow, "month">)[]> = { profit: ["Profit"], money: ["Spent", "Revenue", "Profit"], units: ["Sold"] };
const COLORS: Record<string, string> = { Spent: "#b9c3d1", Revenue: "#10233f", Profit: "#f2a541", Sold: "#10233f" };
const LABELS: Record<string, string> = { Spent: "Cost of goods", Revenue: "Sales", Profit: "Profit", Sold: "Sold" };
const MODES: { id: Mode; label: string }[] = [{ id: "profit", label: "Profit" }, { id: "money", label: "Sales vs cost" }, { id: "units", label: "Units" }];

function niceStep(range: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(range)));
  const f = range / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

export default function YearChart({ months, year, scope, totals }: {
  months: MonthRow[]; year: number; scope: string;
  totals: { profit: number; revenue: number; sold: number };
}) {
  const [mode, setMode] = useState<Mode>("profit");
  const series = SERIES[mode];
  const dollars = mode !== "units";
  const hasData = months.some((m) => m.Spent || m.Revenue || m.Sold);

  const values = months.flatMap((m) => series.map((k) => m[k]));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (!hasData) { lo = 0; hi = dollars ? 1000 : 10; }
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 4);
  const niceLo = Math.floor(lo / step) * step, niceHi = Math.ceil(hi / step) * step;
  const range = niceHi - niceLo;
  const ticks: number[] = [];
  for (let t = niceLo; t <= niceHi + step / 1000; t += step) ticks.push(Math.round(t * 1000) / 1000);
  const pct = (v: number) => ((v - niceLo) / range) * 100;
  const fmt = (v: number) => (dollars ? money(v) : num(v));
  const short = (v: number) => (dollars ? (Math.abs(v) >= 1000 ? `${v < 0 ? "-" : ""}$${+(Math.abs(v) / 1000).toFixed(1)}k` : `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v))}`) : String(v));
  const margin = totals.revenue ? (totals.profit / totals.revenue) * 100 : 0;
  const zero = pct(0);

  return (
    <section className="card !p-5 sm:!p-6" aria-label={`${year} bar graph`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted">{dollars ? `Gross profit in ${year}${scope}` : `Units sold in ${year}${scope}`}</p>
          <p className="mt-1 text-[clamp(2.2rem,6vw,3.4rem)] font-extrabold leading-none tracking-tight tabular-nums">{dollars ? money(totals.profit) : num(totals.sold)}</p>
          {dollars && totals.revenue > 0 && <p className="mt-1.5 text-sm text-muted">{margin.toFixed(1)}% margin on {money(totals.revenue)} in sales</p>}
        </div>
        <div role="group" aria-label="Chart view" className="flex gap-0.5 rounded-xl bg-white p-[3px] ring-1 ring-line">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold ${mode === m.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-6 h-[300px] pl-12 sm:h-[340px]" role="img"
        aria-label={months.map((m) => `${m.month}: ${series.map((k) => `${LABELS[k]} ${fmt(m[k])}`).join(", ")}`).join("; ")}>
        {!hasData && (
          <div className="absolute inset-0 left-12 bottom-7 z-10 grid place-content-center text-center">
            <p className="font-bold">Nothing logged in {year} yet</p>
            <p className="text-sm text-muted">Log a purchase or a sale and the bars appear here.</p>
          </div>
        )}
        <div className="absolute inset-y-0 left-0 right-0 bottom-7">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0" style={{ bottom: `${pct(t)}%` }}>
              <span className="absolute -top-2 left-0 w-10 text-right text-[11px] tabular-nums text-muted">{short(t)}</span>
              <div className={`ml-12 border-t ${t === 0 ? "border-ink/25" : "border-line"}`} />
            </div>
          ))}
          <div className="absolute inset-y-0 left-12 right-0 flex">
            {months.map((m) => (
              <div key={m.month} className="relative flex h-full min-w-0 flex-1 justify-center gap-[2px] px-[3px]">
                {series.map((k) => {
                  const v = m[k];
                  const top = pct(Math.max(v, 0)), base = pct(Math.min(v, 0));
                  return (
                    <div key={k} className="relative h-full min-w-0 max-w-[34px] flex-1" title={`${m.month} \u00b7 ${LABELS[k]}: ${fmt(v)}`}>
                      <span className="absolute inset-x-0 rounded-t-[4px]" style={{ bottom: `${v >= 0 ? zero : base}%`, height: `${Math.max(top - base, v ? 0.6 : 0)}%`, background: COLORS[k] }} />
                      {series.length === 1 && v !== 0 && (
                        <span className="absolute inset-x-0 text-center text-[10px] font-semibold tabular-nums text-muted" style={{ bottom: `calc(${v >= 0 ? top : base}% + ${v >= 0 ? 3 : -14}px)` }}>{short(v)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 left-12 flex">
          {months.map((m) => <span key={m.month} className="min-w-0 flex-1 truncate text-center text-xs text-muted">{m.month}</span>)}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map((k) => (
          <li key={k} className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ background: COLORS[k] }} />{LABELS[k]}</li>
        ))}
      </ul>
    </section>
  );
}
