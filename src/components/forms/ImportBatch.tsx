"use client";
// One-time bulk import: choose the data file and the folder of PDFs, check the list, and every invoice is saved with its PDF attached.
import { useRef, useState } from "react";
import type { ActionResult } from "@/app/actions";
import { money } from "@/lib/calc";
import type { Customer } from "@/lib/types";

type ImportLine = { name: string; upc: string; qty: number; price: number; cost: number; own_card?: boolean };
type ImportInvoice = {
  file: string; kind: "invoice" | "po"; no: string; date: string; customer: string; miles: number; store: string;
  status: "paid" | "unpaid"; paid_on: string | null; pdf_total: number | null; lines: ImportLine[];
};
type Result = { no: string; ok: boolean; text: string };

const baseName = (p: string) => p.split("/").pop()!.toLowerCase();
const totalOf = (i: ImportInvoice) => Math.round(i.lines.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100;

export default function ImportBatch({ action, payAction, customers, existing }: {
  action: (fd: FormData) => Promise<ActionResult>; payAction: (id: string, paid: boolean, paidOn?: string) => Promise<ActionResult>;
  customers: Customer[]; existing: { id: string; kind: string; no: string; status: "paid" | "unpaid" }[];
}) {
  const [invoices, setInvoices] = useState<ImportInvoice[] | null>(null);
  const [pdfs, setPdfs] = useState<Map<string, File>>(new Map());
  const [problem, setProblem] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const folder = useRef<HTMLInputElement>(null);

  async function readData(file: File | undefined) {
    if (!file) return;
    setProblem(""); setResults([]);
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.invoices)) throw new Error("no invoices");
      setInvoices(j.invoices as ImportInvoice[]);
    } catch { setInvoices(null); setProblem("That doesn't look like an import file."); }
  }
  function readPdfs(list: FileList | null) {
    const map = new Map<string, File>();
    for (const f of Array.from(list ?? [])) if (f.name.toLowerCase().endsWith(".pdf")) map.set(baseName(f.name), f);
    setPdfs(map);
  }

  const found = (i: ImportInvoice) => existing.find((e) => e.kind === i.kind && e.no === i.no);
  const isDone = (i: ImportInvoice) => results.some((r) => r.no === i.no && r.ok);
  // Invoices already in the app are not added twice, but their paid / not paid status is brought in line with the file.
  const needsStatus = (i: ImportInvoice) => { const e = found(i); return Boolean(e) && e!.status !== i.status && !isDone(i); };
  const todo = (invoices ?? []).filter((i) => !found(i) && !isDone(i));
  const updates = (invoices ?? []).filter(needsStatus);

  async function run() {
    if (!invoices) return;
    setRunning(true); setResults([]);
    const out: Result[] = [];
    for (const i of updates) {
      const e = found(i)!;
      const r = await payAction(e.id, i.status === "paid", i.paid_on ?? undefined);
      out.push({ no: i.no, ok: r.ok, text: r.ok ? (i.status === "paid" ? "Marked paid" : "Marked not paid") : r.error });
      setResults([...out]);
    }
    for (const i of todo) {
      const fd = new FormData();
      fd.set("kind", i.kind); fd.set("invoice_no", i.no); fd.set("invoice_date", i.date);
      const known = customers.find((c) => c.name.toLowerCase() === i.customer.toLowerCase());
      if (known) fd.set("customer_id", known.id); else fd.set("new_customer_name", i.customer);
      fd.set("miles", String(i.miles ?? 0)); fd.set("store", i.store ?? ""); fd.set("tax_status", "resale"); fd.set("sales_tax", "");
      fd.set("status", i.status); if (i.paid_on) fd.set("paid_on", i.paid_on);
      fd.set("lines", JSON.stringify(i.lines.map((l) => ({ name: l.name, upc: l.upc, qty: l.qty, price: l.price, cost: l.cost, own_card: l.own_card !== false }))));
      const pdf = pdfs.get(baseName(i.file));
      if (pdf) fd.set("file", pdf);
      const r = await action(fd);
      out.push({ no: i.no, ok: r.ok, text: r.ok ? "Saved" : r.error });
      setResults([...out]);
      if (!r.ok && /finalized/i.test(r.error)) continue;
    }
    setRunning(false);
  }

  return (
    <section className="card space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">1. The import file (.json)
          <input type="file" accept="application/json,.json" className="input !h-auto py-2" onChange={(e) => void readData(e.target.files?.[0])} />
        </label>
        <div className="field">2. The folder with the invoice PDFs
          {/* @ts-expect-error webkitdirectory isn't in React's types but every browser supports it */}
          <input ref={folder} type="file" webkitdirectory="" directory="" multiple className="input !h-auto py-2" onChange={(e) => readPdfs(e.target.files)} />
          <span className="mt-1 block text-xs font-normal text-muted">{pdfs.size ? `${pdfs.size} PDFs found.` : "Choose the unzipped “2026 Invoices” folder."}</span>
        </div>
      </div>
      {problem && <p role="alert" className="font-semibold text-bad">{problem}</p>}

      {invoices && (
        <>
          <div className="overflow-x-auto">
            <table className="data-table compact">
              <thead><tr><th>PO / invoice</th><th>Date</th><th className="r">Items</th><th className="r">Total</th><th>PDF</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map((i) => {
                  const res = results.find((r) => r.no === i.no);
                  return (
                    <tr key={`${i.kind}-${i.no}`}>
                      <td className="font-bold">{i.kind === "po" ? "PO " : ""}{i.no}</td><td>{i.date}</td><td className="r">{i.lines.reduce((a, l) => a + l.qty, 0)}</td><td className="r">{money(totalOf(i))}</td>
                      <td>{pdfs.has(baseName(i.file)) ? "Found" : <span className="text-muted">Not chosen yet</span>}</td>
                      <td>{res ? <span className={res.ok ? "font-semibold text-go" : "font-semibold text-bad"}>{res.text}</span> : found(i) ? (needsStatus(i) ? <span className="font-semibold">Already added: will mark {i.status === "paid" ? "paid" : "not paid"}</span> : <span className="text-muted">Already added, nothing to change</span>) : <span>Ready{i.status === "paid" ? " (paid)" : ""}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={running || todo.length + updates.length === 0} onClick={() => void run()}>
              {running ? "Importing…" : todo.length || updates.length ? [todo.length ? `Import ${todo.length} invoice${todo.length === 1 ? "" : "s"}` : "", updates.length ? `update ${updates.length} already in` : ""].filter(Boolean).join(" and ").replace(/^./, (c) => c.toUpperCase()) : "Everything is already in"}
            </button>
            {pdfs.size === 0 && todo.length > 0 && <span className="text-sm text-muted">No PDFs chosen: the invoices will be added without their PDF attached.</span>}
          </div>
        </>
      )}
    </section>
  );
}
