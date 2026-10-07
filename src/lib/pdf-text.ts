// Reads the text out of a PDF, one string per printed line, top to bottom. Runs in the browser (nothing is uploaded to read it).
// The grouping is separate from the PDF library so it can be unit tested without one.

export type TextPiece = { str: string; x: number; y: number; w: number; h: number };

/** Joins pieces of text that sit on the same printed line. Wide gaps (table columns) become two spaces. */
export function groupLines(pieces: TextPiece[]): string[] {
  const live = pieces.filter((p) => p.str.trim() !== "");
  // top of the page first (PDF y grows upward), then left to right
  live.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextPiece[][] = [];
  for (const p of live) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, (p.h || 8) * 0.45);
    if (row && Math.abs(row[0].y - p.y) <= tolerance) row.push(p); else rows.push([p]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const p of row) {
      const gap = p.x - end;
      const unit = Math.max(2, (p.h || 8) * 0.3);
      if (line) line += gap > unit * 3 ? "  " : gap > unit * 0.3 || /\S$/.test(line) && /^\S/.test(p.str) && gap > 0.5 ? " " : "";
      line += p.str.trim();
      end = p.x + p.w;
    }
    return line.replace(/\s+$/, "");
  }).filter(Boolean);
}

type PdfJs = {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>; destroy?: () => Promise<void> }> };
};

/** The printed lines of every page of a PDF. */
export async function pdfLines(data: ArrayBuffer, pdfjs: PdfJs): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const out: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const raw of content.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
        if (typeof it.str !== "string" || !it.transform) continue;
        pieces.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height ?? Math.abs(it.transform[3]) });
      }
      out.push(...groupLines(pieces));
    }
  } finally {
    await doc.destroy?.();
  }
  return out;
}

/** Browser: loads the PDF reader only when a PDF is actually dropped in, then reads it. */
export async function readPdfInBrowser(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfLines(await file.arrayBuffer(), pdfjs as unknown as PdfJs);
}
