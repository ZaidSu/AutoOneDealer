import test from "node:test";
import assert from "node:assert/strict";
import { pdfText, receiptPdf } from "../../src/lib/billing/receipt-pdf.ts";

test("receipt PDF is a well-formed file with the amounts in it", () => {
  const bytes = receiptPdf({
    month: "October 2026", from: "High Level Technologies", to: "Auto One Motors (Dallas)", billNumber: "INV-0001", paidOn: "October 9, 2026",
    items: [{ label: "Plan", detail: "Oct 9 to Nov 8", amount: "$379.00" }, { label: "One-time connection fee", amount: "$99.00" }, { label: "One-time phone number fee", amount: "$11.00" }],
    subtotal: "$489.00", total: "$489.00",
  });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  for (const s of ["Receipt", "INV-0001", "$489.00", "$379.00", "\\(Dallas\\)"]) assert.ok(text.includes(s), s);
  // The xref table points at real objects.
  const xref = Number(text.match(/startxref\n(\d+)/)![1]);
  assert.equal(text.slice(xref, xref + 4), "xref");
  const offsets = [...text.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});
test("pdfText escapes and replaces what a PDF string can't hold", () => {
  assert.equal(pdfText("a (b) \\ c"), "a \\(b\\) \\\\ c");
  assert.equal(pdfText("Zaid’s café"), "Zaid's caf?");
});
