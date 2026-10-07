"use client";
// One row of the Items table that you can change in place.
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import type { Item } from "@/lib/types";

export default function ItemRow({ item, used, figures, update, remove }: {
  item: Item; used: boolean; figures: React.ReactNode;
  update: (fd: FormData) => Promise<ActionResult>; remove: (id: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: item.name, upc: item.upc ?? "", category: item.category ?? "" });
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function save() {
    const fd = new FormData();
    fd.set("item_id", item.id); fd.set("name", f.name); fd.set("upc", f.upc); fd.set("category", f.category); fd.set("sku", item.sku ?? "");
    start(async () => { const r = await update(fd); if (r.ok) { setEditing(false); setErr(""); } else setErr(r.error); });
  }
  if (!editing) {
    return (
      <tr>
        <td>{item.name}</td><td>{item.upc || "\u2014"}</td><td>{item.category || "\u2014"}</td>{figures}
        <td className="r"><span className="inline-flex gap-4">
          <button type="button" className="link-btn" onClick={() => { setF({ name: item.name, upc: item.upc ?? "", category: item.category ?? "" }); setEditing(true); }}>Edit</button>
          <button type="button" className="link-btn danger" disabled={pending}
            onClick={() => { if (used) return alert("This item is on an invoice. Take it off the invoice first."); if (confirm(`Delete \u201c${item.name}\u201d?`)) start(async () => { const r = await remove(item.id); if (!r.ok) alert(r.error); }); }}>Delete</button>
        </span></td>
      </tr>
    );
  }
  return (
    <tr>
      <td><input aria-label="Item name" className="input !h-9" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
      <td><input aria-label="Last 4 of the UPC" className="input !h-9 !w-20" inputMode="numeric" value={f.upc} onChange={(e) => setF({ ...f, upc: e.target.value })} /></td>
      <td><input aria-label="Category" className="input !h-9" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></td>
      {figures}
      <td className="r"><span className="inline-flex items-center gap-3">
        <button type="button" className="link-btn" disabled={pending} onClick={save}>{pending ? "\u2026" : "Save"}</button>
        <button type="button" className="link-btn" onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
        {err && <span role="alert" className="text-xs font-semibold text-bad">{err}</span>}
      </span></td>
    </tr>
  );
}
