// Finds the invoice number, date, customer, items (name, last 4 of the UPC, quantity, price) and totals in the printed lines of
// an invoice or purchase order PDF. It reads common layouts and always shows its result for you to check before saving.
// Pure, so it's unit tested (npm test).

export type ParsedLine = { name: string; upc: string; qty: number; price: number };
export type ParsedInvoice = {
  kind: "invoice" | "po";
  invoiceNo: string | null;
  date: string | null;
  customer: string | null;
  lines: ParsedLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONEY = /^\(?-?\$?\d[\d,]*(?:\.\d{1,2})?\)?$/;
const toNumber = (t: string): number => Number(t.replace(/[$,()]/g, ""));
const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(s + "T00:00:00Z");
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s ? s : null;
};

/** 2026-09-12, 9/12/2026, 09/12/26, "September 12, 2026" or "12 Sep 2026" -> 2026-09-12. */
export function parseDate(text: string): string | null {
  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) return iso(+m[3], +m[1], +m[2]);
  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  return null;
}

/** Last 4 of the UPC from an item's text, and the text with the UPC taken out. */
export function splitUpc(raw: string): { name: string; upc: string } {
  let name = raw.replace(/\s+/g, " ").trim();
  let upc = "";
  const labeled = name.match(/\b(?:upc|gtin|ean|barcode|sku)\b\s*[:#-]?\s*(\d[\d ]*\d|\d)/i);
  if (labeled) {
    const digits = labeled[1].replace(/\s/g, "");
    if (digits.length >= 4) { upc = digits.slice(-4); name = name.replace(labeled[0], " "); }
  }
  if (!upc) {
    const long = name.match(/\b\d{11,14}\b/);
    if (long) { upc = long[0].slice(-4); name = name.replace(long[0], " "); }
  }
  if (!upc) {
    // "(4484)", "#7710", "- 1342" or just "2631" at the very end (but not a year)
    const tail = name.match(/[\s(#-]*\(?#?(\d{4})\)?\s*$/);
    if (tail && !/^(19|20)\d\d$/.test(tail[1]) && name.slice(0, tail.index).trim().length >= 2) { upc = tail[1]; name = name.slice(0, tail.index); }
  }
  name = name.replace(/\(\s*\)/g, "").replace(/[\s,;:#-]+$/g, "").replace(/\s+/g, " ").trim();
  return { name, upc };
}

const TOTAL_LINE = /^(sub\s*-?\s*total|total|amount\s+due|balance\s+due|balance|grand\s+total|(?:sales\s+)?tax|vat|shipping|discount|amount\s+paid|payment)\b/i;

function lastMoney(line: string): number | null {
  const tokens = line.trim().split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) if (MONEY.test(tokens[i]) && /[.$]/.test(tokens[i])) return toNumber(tokens[i]);
  return null;
}

type Header = { qtyFirst: boolean } | null;

function headerOf(line: string): Header {
  const l = line.toLowerCase();
  const qty = l.search(/\b(qty|quantity|units?)\b/);
  const price = l.search(/\b(price|rate|unit)\b/);
  const amt = l.search(/\b(amount|total|line total|ext)\b/);
  if (qty < 0 || price < 0 || amt < 0) return null;
  const desc = l.search(/\b(items?|description|product|name|details?)\b/);
  return { qtyFirst: desc >= 0 ? qty < desc : qty === 0 };
}

/** One printed row -> an item, or null when it isn't an item row. */
function rowOf(line: string, qtyFirst: boolean): { text: string; qty: number; price: number; amount: number } | null {
  const t = line.trim().split(/\s+/);
  if (t.length < 3) return null;
  const amountTok = t[t.length - 1], priceTok = t[t.length - 2];
  if (!MONEY.test(amountTok) || !MONEY.test(priceTok) || !/[.$]/.test(amountTok) || !/[.$]/.test(priceTok)) return null;
  const price = toNumber(priceTok), amount = toNumber(amountTok);
  let qtyTok: string, rest: string[];
  if (qtyFirst) { qtyTok = t[0]; rest = t.slice(1, -2); } else { qtyTok = t[t.length - 3]; rest = t.slice(0, -3); }
  if (!/^\d+(\.0+)?$/.test(qtyTok ?? "")) return null;
  const qty = Math.round(Number(qtyTok));
  if (qty < 1 || rest.length === 0) return null;
  return { text: rest.join(" "), qty, price, amount };
}

/**
 * Purchase orders laid out as a table with columns PRODUCT / DESCRIPTION / (UPC) / QTY / PRICE / TOTAL. The columns are told
 * apart by the wide gaps between them. A 12-digit UPC is printed in two pieces: 9 digits in the row, the last 3 on the wrapped
 * line under it, so the last 4 come from both. Tables can continue onto a second page. Returns null when the text isn't that layout.
 */
export function parsePurchaseOrder(raw: string[]): ParsedInvoice | null {
  const lines = raw.map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  const text = lines.join("\n");
  if (!/purchase\s+order/i.test(text)) return null;
  const head = lines.findIndex((l) => /\bPRODUCT\b/i.test(l) && /\bQTY\b/i.test(l) && /\bPRICE\b/i.test(l) && /\bTOTAL\b/i.test(l));
  if (head < 0) return null;

  const no = text.match(/\bP\.?\s?O\.?\s*NO\.?\s*[:#]?\s*(\d+)/i) ?? text.match(/\bPURCHASE\s+ORDER\s+(?:NO\.?\s*)?[:#]?\s*(\d+)/i);
  const dateText = text.match(/\bDATE\s*[:]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const out: ParsedInvoice = {
    kind: "po", invoiceNo: no ? no[1] : null, date: dateText ? parseDate(dateText[1]) : parseDate(text),
    // a purchase order comes from the customer, whose name is at the top of the page
    customer: /^[A-Za-z][\w &.'-]{1,60}$/.test(lines[0].trim()) ? lines[0].trim() : null,
    lines: [], subtotal: null, tax: null, total: null,
  };

  const cols = (l: string) => l.trim().split(/\s{2,}/);
  let current: { name: string; upcHead: string; upc: string; qty: number; price: number } | null = null;
  const flush = () => { if (current) out.lines.push({ name: current.name, upc: current.upc, qty: current.qty, price: current.price }); current = null; };

  for (const l of lines.slice(head + 1)) {
    const t = l.trim();
    const money = t.match(/^(SUB\s*TOTAL|TOTAL)\s+\$?\s*([\d,]+\.\d{2})$/i);
    if (money) { flush(); if (/^sub/i.test(money[1])) out.subtotal = toNumber(money[2]); else out.total = toNumber(money[2]); continue; }
    if (/^(approved by|date$|all sales|thank you|page \d+ of \d+)/i.test(t)) continue;

    const c = cols(l);
    const tail = c.slice(-3);
    if (c.length >= 4 && /^\d{1,5}$/.test(tail[0]) && /^[\d,]+\.\d{2}$/.test(tail[1]) && /^[\d,]+\.\d{2}$/.test(tail[2])) {
      flush();
      const pre = c.slice(0, -3);
      const upcHead = pre.length >= 2 && /^\d{9,12}$/.test(pre[pre.length - 1]) ? pre.pop()! : "";
      const name = (pre.length >= 2 ? pre.slice(1).join(" ") : pre[0] ?? "").replace(/\s+/g, " ").trim();
      current = { name, upcHead, upc: upcHead.length === 12 ? upcHead.slice(-4) : "", qty: Number(tail[0]), price: toNumber(tail[1]) };
      continue;
    }
    // text under a row: its wrapped description, and the end of its UPC
    if (current && !current.upc && current.upcHead.length === 9) {
      const last = c[c.length - 1];
      if (/^\d{3}$/.test(last)) current.upc = (current.upcHead + last).slice(-4);
    }
  }
  flush();
  if (out.lines.length === 0) return null;
  if (out.total === null) out.total = out.subtotal;
  return out;
}

export function parseInvoiceLines(all: string[]): ParsedInvoice {
  const po = parsePurchaseOrder(all);
  if (po) return po;
  const lines = all.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: ParsedInvoice = { kind: "invoice", invoiceNo: null, date: null, customer: null, lines: [], subtotal: null, tax: null, total: null };

  // invoice / PO number and which of the two it is
  for (const l of lines) {
    const m = l.match(/\b(invoice|purchase\s+order|po)\s*(?:number|no\.?|num|#)\s*[:#]?\s*([A-Za-z0-9][\w-]*)/i);
    if (m) { out.invoiceNo = m[2]; out.kind = /^(purchase|po)/i.test(m[1]) ? "po" : "invoice"; break; }
  }

  // date: next to an "invoice date"-style label, else the first date that isn't a due date
  const labelled = lines.find((l) => /\b(invoice|issue|issued|po|order)?\s*date\b/i.test(l) && !/due/i.test(l) && parseDate(l));
  out.date = labelled ? parseDate(labelled) : parseDate(lines.filter((l) => !/due/i.test(l)).join("\n"));

  // customer: the name under (or after) "Bill To"
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:bill(?:ed)?\s*to|customer|sold\s*to)\s*:?\s*(.*)$/i);
    if (m) { out.customer = (m[1] || lines[i + 1] || "").replace(/\s{2,}.*/, "").trim() || null; break; }
  }

  // the item table
  let header: Header = null;
  let started = false;
  for (const l of lines) {
    const h = headerOf(l);
    if (!started && h) { header = h; started = true; continue; }
    if (TOTAL_LINE.test(l)) {
      const v = lastMoney(l);
      if (v !== null) {
        if (/^sub/i.test(l)) out.subtotal = v;
        else if (/tax|vat/i.test(l)) out.tax = v;
        else if (/^(total|grand|amount\s+due|balance)/i.test(l)) out.total = v;
      }
      if (out.lines.length) started = started && true;
      continue;
    }
    const row = rowOf(l, header?.qtyFirst ?? false);
    if (row && (started || Math.abs(row.qty * row.price - row.amount) < 0.02)) {
      const { name, upc } = splitUpc(row.text);
      out.lines.push({ name: name || row.text, upc, qty: row.qty, price: row.price });
      continue;
    }
    // text under an item row (its description) can carry the UPC
    const prev = out.lines[out.lines.length - 1];
    if (started && prev && !prev.upc && !TOTAL_LINE.test(l)) {
      const { upc } = splitUpc(l);
      if (upc && /\b(upc|gtin|ean|barcode|sku)\b|\d{11,14}/i.test(l)) prev.upc = upc;
    }
  }
  if (out.total === null && out.subtotal !== null) out.total = out.subtotal + (out.tax ?? 0);
  return out;
}
