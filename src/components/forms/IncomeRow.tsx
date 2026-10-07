"use client";
// One row of the Income table that you can change in place.
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { money } from "@/lib/calc";
import type { Income, Project } from "@/lib/types";

export default function IncomeRow({ row, projects, save, remove }: {
  row: Income; projects: Project[];
  save: (fd: FormData) => Promise<ActionResult>; remove: (id: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ date: row.received_on, source: row.source, project: row.project_id ?? "", amount: String(row.amount), notes: row.notes ?? "" });
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const projectName = projects.find((p) => p.id === row.project_id)?.name;

  function submit() {
    const fd = new FormData();
    fd.set("income_id", row.id); fd.set("received_on", f.date); fd.set("source", f.source); fd.set("project_id", f.project); fd.set("amount", f.amount); fd.set("notes", f.notes);
    start(async () => { const r = await save(fd); if (r.ok) { setEditing(false); setErr(""); } else setErr(r.error); });
  }

  if (!editing) {
    return (
      <tr>
        <td>{row.received_on}</td>
        <td>{row.source}{row.notes ? <div className="text-xs text-muted">{row.notes}</div> : null}</td>
        <td>{projectName ?? "—"}</td>
        <td className="r font-bold">{money(row.amount)}</td>
        <td className="r"><span className="inline-flex gap-4">
          <button type="button" className="link-btn" onClick={() => { setF({ date: row.received_on, source: row.source, project: row.project_id ?? "", amount: String(row.amount), notes: row.notes ?? "" }); setEditing(true); }}>Edit</button>
          <button type="button" className="link-btn danger" disabled={pending}
            onClick={() => { if (confirm(`Delete this ${money(row.amount)} from ${row.source}?`)) start(async () => { const r = await remove(row.id); if (!r.ok) alert(r.error); }); }}>Delete</button>
        </span></td>
      </tr>
    );
  }
  return (
    <tr>
      <td><input aria-label="Date" type="date" className="input !h-9" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></td>
      <td>
        <input aria-label="From where" className="input !h-9" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} />
        <input aria-label="Notes" placeholder="Notes" className="input !h-9 mt-1" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </td>
      <td>
        <select aria-label="Project" className="input !h-9" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}>
          <option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="r"><input aria-label="Amount" type="number" min="0" step="0.01" className="input !h-9 !w-28" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></td>
      <td className="r"><span className="inline-flex items-center gap-3">
        <button type="button" className="link-btn" disabled={pending} onClick={submit}>{pending ? "…" : "Save"}</button>
        <button type="button" className="link-btn" onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
        {err && <span role="alert" className="text-xs font-semibold text-bad">{err}</span>}
      </span></td>
    </tr>
  );
}
