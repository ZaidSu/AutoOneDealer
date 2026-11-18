"use client";
// "Record a sale" button for the Inventory page: opens the sale form in a pop-up, with a little (i) that explains it on hover.
import { useEffect, useId, useState } from "react";
import type { LotCar } from "@/lib/registration/sales";
import RecordSaleForm from "./RecordSaleForm";

const TIP = "Record a sale. The AI will follow up with the customer after some time. The assistant also keeps track of your analytics.";

export default function RecordSaleButton({ lot, today }: { lot: LotCar[]; today: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <span className="group relative inline-flex">
        <button type="button" className="btn btn-red gap-2" aria-describedby={tipId} onClick={() => setOpen(true)}>
          Record a sale
          <span aria-hidden className="grid size-4 place-items-center rounded-full border border-white/70 text-[10px] font-bold not-italic leading-none">i</span>
        </button>
        <span id={tipId} role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-ink px-4 py-3 text-left text-sm font-medium leading-snug text-white shadow-lg group-focus-within:block group-hover:block">
          {TIP}
        </span>
      </span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="record-sale-title" className="panel relative w-full max-w-2xl overflow-hidden bg-white p-5 sm:p-6">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#2f6fed] via-[#0ca7a0] to-[#12a150]" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="record-sale-title" className="section-title">Record a sale</h2>
                <p className="mt-1 text-[15px] text-muted">The car moves to Sold, the customer is saved, and a week later the AI texts to check in and ask for a Google review.</p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(false)} aria-label="Close">Close</button>
            </div>
            <div className="mt-4"><RecordSaleForm lot={lot} today={today} /></div>
          </div>
        </div>
      )}
    </>
  );
}
