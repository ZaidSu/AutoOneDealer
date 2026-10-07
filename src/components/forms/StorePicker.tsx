"use client";
import { useRef, useState } from "react";
import { STORES, storeStyle } from "@/lib/stores";

// Pick where you bought it: Walmart, Amazon, Best Buy or Target in their own colors, or type any other store.
export default function StorePicker({ value, onChange }: { value: string; onChange: (store: string) => void }) {
  const known = storeStyle(value);
  const [otherMode, setOtherMode] = useState(false);
  const otherRef = useRef<HTMLInputElement>(null);
  const isOther = otherMode || (Boolean(value) && !known);

  return (
    <div className="field">
      <span id="store-label">Store</span>
      <input type="hidden" name="store" value={value} />
      <div role="group" aria-labelledby="store-label" className="flex flex-wrap gap-2">
        {STORES.map((s) => {
          const on = known?.name === s.name && !isOther;
          return (
            <button key={s.name} type="button" aria-pressed={on} onClick={() => { setOtherMode(false); onChange(on ? "" : s.name); }}
              className="inline-flex h-[42px] items-center gap-2 rounded-[10px] border px-3.5 text-[14px] font-bold transition-colors"
              style={on ? { background: s.bg, color: s.fg, borderColor: s.bg } : { background: "#fff", color: "#10233f", borderColor: "#d5dbe4" }}>
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.bg, boxShadow: on ? `0 0 0 2px ${s.fg}55` : undefined }} />
              {s.name}
            </button>
          );
        })}
        <button type="button" aria-pressed={isOther} onClick={() => { setOtherMode(true); if (known) onChange(""); setTimeout(() => otherRef.current?.focus(), 0); }}
          className={`inline-flex h-[42px] items-center rounded-[10px] border px-3.5 text-[14px] font-bold ${isOther ? "border-ink bg-ink text-white" : "border-[#d5dbe4] bg-white"}`}>
          Other
        </button>
        {isOther && (
          <input ref={otherRef} aria-label="Other store" placeholder="Store name" value={known ? "" : value} onChange={(e) => onChange(e.target.value)} className="input !h-[42px] !w-44" />
        )}
      </div>
    </div>
  );
}
