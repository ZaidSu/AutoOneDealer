"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import ActionForm from "@/components/ui/ActionForm";
import Icon from "@/components/ui/Icon";

export type CheckItem = { ok: boolean; text: string; href: string; cta: string };

/** The "before you finalize" list, with a note and the Finalize button. Closed until you ask for it. */
export function FinalizePanel({ year, quarter, label, checks, action }: {
  year: number; quarter: number; label: string; checks: CheckItem[]; action: (fd: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Review and finalize</button>;
  const open_ = checks.filter((c) => !c.ok).length;
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="font-bold">Before you finalize {label}</p>
      <ul className="mt-2">
        {checks.map((c, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-line/70 py-2 text-[14.5px] last:border-0">
            <Icon name={c.ok ? "check" : "alert"} className={`size-[17px] shrink-0 ${c.ok ? "text-go" : "text-accent-ink"}`} />
            <span className="flex-1">{c.text}</span>
            {!c.ok && <a href={c.href} className="link-btn whitespace-nowrap text-sm">{c.cta}</a>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        Finalizing locks every purchase, sale, invoice and expense dated in this quarter, and saves its totals. You can reopen it later if something needs fixing.
        {open_ > 0 ? ` ${open_} thing${open_ === 1 ? "" : "s"} above still need a look; you can finalize anyway.` : ""}
      </p>
      <ActionForm action={action} submitLabel={`Finalize ${label}`} reset={false}>
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="quarter" value={quarter} />
        <label className="field mt-3 max-w-xl">Note (optional)<input name="note" className="input" placeholder="Filed with the Comptroller on…" /></label>
      </ActionForm>
      <button type="button" className="link-btn mt-3 text-sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

export function ReopenButton({ year, quarter, label, action }: { year: number; quarter: number; label: string; action: (fd: FormData) => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm" disabled={pending}
      onClick={() => {
        if (!confirm(`Reopen ${label}? Its purchases, sales, invoices and expenses become editable again. Finalize it again when you're done.`)) return;
        const fd = new FormData();
        fd.set("year", String(year)); fd.set("quarter", String(quarter));
        start(async () => { const r = await action(fd); if (!r.ok) alert(r.error); });
      }}>
      {pending ? "Reopening\u2026" : "Reopen to edit"}
    </button>
  );
}
