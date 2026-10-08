// A one-page receipt as a real PDF file, written by hand (no library needed). Pure: relative imports only, so it can be unit tested.

export type ReceiptData = {
  month: string; from: string; to: string; billNumber: string; paidOn: string;
  items: { label: string; detail?: string; amount: string }[];
  subtotal: string; tax?: string; total: string;
};

// Helvetica widths (per 1000 units) for the characters amounts use, so amounts can be right-aligned.
const W: Record<string, number> = { "$": 556, ".": 278, ",": 278, "-": 333, "(": 333, ")": 333 };
const widthOf = (text: string, size: number) => [...text].reduce((n, c) => n + (W[c] ?? (/\d/.test(c) ? 556 : 556)), 0) * size / 1000;

/** Keeps text safe inside a PDF string: only printable Latin-1, with ( ) and \ escaped. */
export function pdfText(text: string): string {
  return String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
}

export function receiptPdf(r: ReceiptData): Uint8Array {
  const ops: string[] = [];
  const text = (s: string, x: number, y: number, size = 11, bold = false, gray = false) =>
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${gray ? "0.42 0.42 0.44" : "0.11 0.11 0.12"} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfText(s)}) Tj ET`);
  const right = (s: string, xRight: number, y: number, size = 11, bold = false) => text(s, xRight - widthOf(pdfText(s).replace(/\\/g, ""), size), y, size, bold);
  const line = (y: number) => ops.push(`0.89 0.88 0.85 RG 0.8 w 56 ${y} m 556 ${y} l S`);

  text("Receipt", 56, 720, 26, true);
  text(r.month, 56, 698, 13, false, true);
  ops.push("0.89 0.95 0.92 rg 480 712 76 22 re f");
  text("PAID", 502, 719, 12, true);
  line(680);
  let y = 655;
  const pair = (label: string, value: string, x: number, yy: number) => { text(label, x, yy, 10, false, true); text(value, x, yy - 15, 12, true); };
  pair("From", r.from, 56, y); pair("To", r.to, 320, y);
  y -= 46;
  pair("Receipt for bill", r.billNumber, 56, y); pair("Paid on", r.paidOn, 320, y);
  y -= 34;
  line(y);
  y -= 24;
  for (const item of r.items.slice(0, 14)) {
    text(item.label, 56, y, 12);
    right(item.amount, 556, y, 12);
    if (item.detail) { y -= 14; text(item.detail, 56, y, 10, false, true); }
    y -= 12; line(y); y -= 20;
  }
  text("Subtotal", 56, y, 11, false, true); right(r.subtotal, 556, y, 11);
  if (r.tax) { y -= 17; text("Sales tax", 56, y, 11, false, true); right(r.tax, 556, y, 11); }
  y -= 26;
  text("Amount paid", 56, y, 15, true); right(r.total, 556, y, 15, true);
  y -= 44;
  text("Thank you for your payment.", 56, y, 11, false, true);

  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
}
