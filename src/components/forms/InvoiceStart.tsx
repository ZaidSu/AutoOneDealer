"use client";
// The top of the Invoices page: drop an invoice PDF to have its items read for you, or start one by hand.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ParsedInvoice } from "@/lib/invoice-parse";
import { parseInvoiceLines } from "@/lib/invoice-parse";
import { readPdfInBrowser } from "@/lib/pdf-text";
import { fileProblem } from "@/lib/validate";
import InvoiceEditor, { type Props } from "./InvoiceEditor";

type Stage = { mode: "idle" } | { mode: "reading"; name: string } | { mode: "edit"; prefill?: ParsedInvoice; file: File | null; nonce: number };

export default function InvoiceStart(props: Omit<Props, "prefill" | "file" | "onSaved" | "onCancel">) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ mode: "idle" });
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState("");

  async function take(file: File | undefined) {
    if (!file) return;
    setProblem("");
    const bad = fileProblem(file);
    if (bad) return setProblem(bad);
    if (file.type !== "application/pdf") return setStage({ mode: "edit", file, nonce: Date.now() });
    setStage({ mode: "reading", name: file.name });
    try {
      const parsed = parseInvoiceLines(await readPdfInBrowser(file));
      setStage({ mode: "edit", prefill: parsed, file, nonce: Date.now() });
    } catch {
      setStage({ mode: "edit", file, nonce: Date.now() });
    }
  }

  if (stage.mode === "edit") {
    return (
      <InvoiceEditor key={stage.nonce} {...props} prefill={stage.prefill} file={stage.file}
        onSaved={(id) => router.push(`/invoices/${id}`)} onCancel={() => setStage({ mode: "idle" })} />
    );
  }
  return (
    <section className="card">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}
        className={`rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${over ? "border-ink bg-paper" : "border-[#cbd3de]"}`}
      >
        <input ref={input} type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
        {stage.mode === "reading" ? (
          <p role="status" className="font-bold">Reading {stage.name}&hellip;</p>
        ) : (
          <>
            <p className="text-lg font-extrabold">Drop an invoice PDF here</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">I&rsquo;ll pull out the items, last 4 of the UPC and prices. You check them, add what each one cost, and save.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>Choose a PDF</button>
              <button type="button" className="btn" onClick={() => setStage({ mode: "edit", file: null, nonce: Date.now() })}>Or create one by hand</button>
            </div>
            <p className="mt-4 text-sm text-muted">Have a whole folder of them? <a className="link-btn" href="/import">Import a batch</a></p>
          </>
        )}
        {problem && <p role="alert" className="mt-3 text-sm font-semibold text-bad">{problem}</p>}
      </div>
    </section>
  );
}
