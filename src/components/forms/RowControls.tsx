"use client";
// Small buttons that change one row and refresh the page. Each takes its action as a prop
// (a server action live, a browser action in preview mode).
import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

/**
 * Confirm that a payment arrived, and on which day. Unpaid: pick the day (today to start) and confirm.
 * Paid: shows the day, lets you correct it, or mark it unpaid again.
 */
export function PaymentControl({ id, paid, paidOn, today, action }: {
  id: string; paid: boolean; paidOn: string | null; today: string; action: (id: string, paid: boolean, paidOn?: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [day, setDay] = useState(paidOn ?? today);
  const run = (nextPaid: boolean) => start(async () => { const r = await action(id, nextPaid, day); if (!r.ok) alert(r.error); });
  if (!paid) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted">Paid on
          <input type="date" aria-label="Day the payment arrived" className="input !h-9 !w-auto !text-sm" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button type="button" className="btn btn-sm" disabled={pending || !day} onClick={() => run(true)}>{pending ? "\u2026" : "Confirm payment"}</button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-muted">Paid on
        <input type="date" aria-label="Day the payment arrived" className="input !h-9 !w-auto !text-sm" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      {day !== paidOn && <button type="button" className="link-btn" disabled={pending || !day} onClick={() => run(true)}>Save date</button>}
      <button type="button" className="link-btn" disabled={pending} onClick={() => start(async () => { const r = await action(id, false); if (!r.ok) alert(r.error); })}>Mark unpaid</button>
    </span>
  );
}

/** Which card an invoice's items were bought with. "Mixed" shows when its items differ; picking either option sets them all. */
export function CardControl({ id, state, action }: { id: string; state: "mine" | "theirs" | "mixed"; action: (id: string, ownCard: boolean) => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label="Which card the items were bought with" className="input !h-9 !w-auto !text-sm" value={state} disabled={pending}
      onChange={(e) => { const v = e.target.value; if (v === "mixed") return; start(async () => { const r = await action(id, v === "mine"); if (!r.ok) alert(r.error); }); }}>
      <option value="mine">My card (they owe the full price)</option>
      <option value="theirs">Their card (they owe just my profit)</option>
      {state === "mixed" && <option value="mixed" disabled>Mixed (set per item when editing)</option>}
    </select>
  );
}

export function CustomerTaxSelect({ id, value, name, action }: { id: string; value: string; name: string; action: (id: string, status: string) => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label={`Usual tax for ${name}`} className="input !h-9 !w-auto !text-sm" value={value} disabled={pending}
      onChange={(e) => { const v = e.target.value; start(async () => { const r = await action(id, v); if (!r.ok) alert(r.error); }); }}>
      <option value="resale">Resale</option>
      <option value="exempt">Exempt</option>
      <option value="taxable">Taxable</option>
    </select>
  );
}

/** An Upload / Replace button for one file on one row. `field` is the name of the row id the action expects. */
export function CertUpload({ customerId, hasFile, action, field = "customer_id" }: { customerId: string; hasFile: boolean; action: (fd: FormData) => Promise<ActionResult>; field?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <input ref={ref} type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const fd = new FormData();
          fd.set(field, customerId);
          fd.set("file", file);
          start(async () => { const r = await action(fd); if (!r.ok) alert(r.error); });
        }} />
      <button type="button" className="link-btn" disabled={pending} onClick={() => ref.current?.click()}>
        {pending ? "Uploading\u2026" : hasFile ? "Replace" : "Upload"}
      </button>
    </>
  );
}
