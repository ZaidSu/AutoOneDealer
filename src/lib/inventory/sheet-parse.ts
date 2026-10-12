// Reads the inventory sheet that CarsForSale exports as a PDF: one row per car with columns such as
// Year, Make, Model, Trim, VIN, Mileage, Price (and a link or stock number, if the export includes them).
// No outside libraries: the text and the hyperlinks are pulled straight out of the PDF's pages. Pure, so it can be tested.
import { inflateSync } from "node:zlib";

export type SheetCar = {
  year: number; make: string; model: string; trim: string | null; vin: string; mileage: number | null; price: number | null;
  /** The car's page on the website, when the sheet has it (as a link on the row, or a Link column). */
  url: string | null;
  /** The stock number, when the sheet has that column. */
  stock: string | null;
};

const MULTI_WORD_MAKES = ["Land Rover", "Alfa Romeo", "Aston Martin", "Rolls Royce", "Rolls-Royce", "Mercedes-Benz", "Mercedes Benz", "Mini Cooper"];

/** Splits "Land Rover Range Rover Sport" / "Acura TLX" into make and model. */
export function splitMakeModel(text: string): { make: string; model: string } {
  const t = text.replace(/\s+/g, " ").trim();
  const multi = MULTI_WORD_MAKES.find((m) => t.toLowerCase().startsWith(`${m.toLowerCase()} `));
  if (multi) return { make: t.slice(0, multi.length), model: t.slice(multi.length).trim() };
  const [make, ...rest] = t.split(" ");
  return { make: make ?? "", model: rest.join(" ") };
}

const digits = (t: string | undefined | null) => { const n = Number(String(t ?? "").replace(/[^\d]/g, "")); return n > 0 ? n : null; };
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

// ---- plain text rows ("2021 Acura TLX 19UUB6F51MA002066 62,127 $22,995") ----
const ROW = /^((?:19|20)\d{2})\s+(.+?)\s+([A-HJ-NPR-Z0-9]{17})\s+([\d,]+)(?:\s+\$?\s*([\d,]+))?\s*$/i;

/** Cars out of text lines, from the PDF's text or copied and pasted from it. Anything between the year and the VIN is the make, model and trim. */
export function parseSheetText(text: string): SheetCar[] {
  const cars: SheetCar[] = [];
  const seen = new Set<string>();
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const m = ROW.exec(raw.replace(/[\t ]+/g, " ").replace(/\s+/g, " ").trim());
    if (!m) continue;
    const vin = m[3].toUpperCase();
    if (seen.has(vin)) continue;
    seen.add(vin);
    const { make, model } = splitMakeModel(m[2]);
    if (!make) continue;
    cars.push({ year: Number(m[1]), make, model, trim: null, vin, mileage: digits(m[4]), price: digits(m[5]), url: null, stock: null });
  }
  return cars;
}

// ---- reading the PDF ----
type Piece = { x: number; y: number; text: string };
type Link = { rect: [number, number, number, number]; uri: string };
export type SheetRow = { y: number; cells: Piece[]; link: string | null };

function unescapeLiteral(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[++i];
    if (n === undefined) break;
    if (n === "n") out += "\n"; else if (n === "r") out += "\r"; else if (n === "t") out += "\t"; else if (n === "b" || n === "f") out += "";
    else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1] ?? "")) o += s[++i]; out += String.fromCharCode(parseInt(o, 8)); }
    else if (n === "\r" || n === "\n") { /* line continuation */ } else out += n;
  }
  return out;
}

/** One page's drawing commands -> pieces of text with their positions. */
function textPieces(content: string): Piece[] {
  const pieces: Piece[] = [];
  let x = 0, y = 0, lx = 0, ly = 0;
  const re = /\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[(?:\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]*>|[^\]()<>])*\]|-?\d*\.?\d+|[A-Za-z'"*]+/g;
  const stack: string[] = [];
  const str = (tok: string) => (tok.startsWith("(") ? unescapeLiteral(tok.slice(1, -1)) : tok.startsWith("<")
    ? (tok.slice(1, -1).replace(/\s/g, "").match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join("") : "");
  for (const m of content.matchAll(re)) {
    const tok = m[0];
    if (/^(?:\(|<|\[|-?\d*\.?\d+$)/.test(tok)) { stack.push(tok); if (stack.length > 8) stack.shift(); continue; }
    if (tok === "BT") { x = y = lx = ly = 0; stack.length = 0; continue; }
    if (tok === "Tm") { const n = stack.slice(-6).map(Number); if (n.length === 6) { x = lx = n[4]; y = ly = n[5]; } }
    else if (tok === "Td" || tok === "TD") { const n = stack.slice(-2).map(Number); if (n.length === 2) { lx += n[0]; ly += n[1]; x = lx; y = ly; } }
    else if (tok === "Tj" || tok === "'" || tok === '"') { const s = stack.at(-1); if (s) pieces.push({ x, y, text: str(s) }); }
    else if (tok === "TJ") {
      const arr = stack.at(-1);
      if (arr?.startsWith("[")) pieces.push({ x, y, text: [...arr.matchAll(/\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]*>/g)].map((p) => str(p[0])).join("") });
    }
    stack.length = 0;
  }
  return pieces;
}

type Obj = { dict: string; stream: string | null };

function readObjects(data: string): Map<number, Obj> {
  const objs = new Map<number, Obj>();
  for (const m of data.matchAll(/(?:^|[\r\n\s])(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj/g)) {
    const body = m[2];
    const s = /stream\r?\n/.exec(body);
    if (!s) { objs.set(Number(m[1]), { dict: body, stream: null }); continue; }
    const dict = body.slice(0, s.index);
    let stream = body.slice(s.index + s[0].length);
    const end = stream.lastIndexOf("endstream");
    if (end >= 0) stream = stream.slice(0, end);
    if (/FlateDecode/.test(dict)) {
      try { stream = inflateSync(Buffer.from(stream.replace(/\r?\n$/, ""), "latin1")).toString("latin1"); } catch { objs.set(Number(m[1]), { dict, stream: null }); continue; }
    } else if (/DCTDecode|\/Subtype\s*\/Image/.test(dict)) { objs.set(Number(m[1]), { dict, stream: null }); continue; }
    objs.set(Number(m[1]), { dict, stream });
  }
  return objs;
}

const refs = (text: string) => [...text.matchAll(/(\d+)\s+\d+\s+R\b/g)].map((m) => Number(m[1]));
/** The object numbers named by a key like /Contents or /Annots: a single reference, a list, or a reference to a list. */
function refList(dict: string, key: string, objs: Map<number, Obj>): number[] {
  const m = new RegExp(`/${key}\\s*(\\[[^\\]]*\\]|\\d+\\s+\\d+\\s+R)`).exec(dict);
  if (!m) return [];
  if (m[1].startsWith("[")) return refs(m[1]);
  const target = refs(m[1])[0];
  const body = objs.get(target)?.dict ?? "";
  return /^\s*\[/.test(body) ? refs(body) : [target];
}

function linkOf(obj: Obj): Link | null {
  if (!/\/Subtype\s*\/Link/.test(obj.dict)) return null;
  const rect = /\/Rect\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(obj.dict);
  const uri = /\/URI\s*\(((?:\\[\s\S]|[^\\)])*)\)/.exec(obj.dict);
  if (!rect || !uri) return null;
  return { rect: [Number(rect[1]), Number(rect[2]), Number(rect[3]), Number(rect[4])], uri: unescapeLiteral(uri[1]).trim() };
}

/** Every page of the PDF as rows of text cells (left to right), with the hyperlink on each row if it has one. */
export function pdfRows(bytes: Uint8Array): SheetRow[][] {
  const data = Buffer.from(bytes).toString("latin1");
  if (!data.startsWith("%PDF")) throw new Error("not_pdf");
  const objs = readObjects(data);
  const pages: SheetRow[][] = [];
  for (const [, obj] of objs) {
    if (!/\/Type\s*\/Page\b(?!s)/.test(obj.dict)) continue;
    const content = refList(obj.dict, "Contents", objs).map((n) => objs.get(n)?.stream ?? "").join("\n");
    if (!/\b(?:Tj|TJ)\b/.test(content)) continue;
    const links = refList(obj.dict, "Annots", objs).map((n) => objs.get(n)).filter((o): o is Obj => Boolean(o)).map(linkOf).filter((l): l is Link => Boolean(l));
    const groups: { y: number; items: Piece[] }[] = [];
    for (const p of textPieces(content)) {
      if (!p.text.trim()) continue;
      const g = groups.find((r) => Math.abs(r.y - p.y) <= 1.5);
      if (g) g.items.push(p); else groups.push({ y: p.y, items: [p] });
    }
    groups.sort((a, b) => b.y - a.y);
    pages.push(groups.map((g) => {
      // A link belongs to the row whose text sits inside the link's box.
      const hits = links.filter((l) => g.y >= l.rect[1] - 2 && g.y <= l.rect[3] + 2).map((l) => l.uri);
      return { y: g.y, cells: g.items.sort((a, b) => a.x - b.x), link: hits.find((u) => /\/details\//i.test(u)) ?? hits.find((u) => /^https?:\/\//i.test(u)) ?? null };
    }));
  }
  return pages;
}

// ---- turning rows into cars ----
type Col = "year" | "make" | "model" | "trim" | "vin" | "mileage" | "price" | "stock" | "link";
const HEADER_NAMES: [Col, RegExp][] = [
  ["year", /^year$/i], ["make", /^make$/i], ["model", /^model$/i], ["trim", /^(trim|style|series|trim level)$/i], ["vin", /^(vin|vin #|vin number)$/i],
  ["mileage", /^(mileage|miles|odometer)$/i], ["price", /^(price|internet price|sale price|asking price|selling price|our price)$/i],
  ["stock", /^(stock|stock #|stock number|stock no\.?|stk #?)$/i], ["link", /^(link|url|website|web link|vehicle link|details)$/i],
];
type Header = { col: Col; x: number }[];

function headerOf(row: SheetRow): Header | null {
  const found: Header = [];
  for (const c of row.cells) {
    const name = HEADER_NAMES.find(([, re]) => re.test(c.text.trim()));
    if (name) found.push({ col: name[0], x: c.x });
  }
  return found.some((f) => f.col === "year") && found.some((f) => f.col === "vin") ? found.sort((a, b) => a.x - b.x) : null;
}

/** Cars from the PDF's rows, using the header row to tell which cell is which (so extra columns, like Trim, are fine). */
function carsFromRows(pages: SheetRow[][]): SheetCar[] {
  const cars: SheetCar[] = [];
  const seen = new Set<string>();
  let header: Header | null = null;
  for (const rows of pages) for (const row of rows) {
    const h = headerOf(row);
    if (h) { header = h; continue; }
    if (!header) continue;
    const cell: Partial<Record<Col, string>> = {};
    for (const p of row.cells) {
      // The column is the last header that starts at or before this cell (a few points of slack for alignment).
      let col: Col | null = null;
      for (const hd of header) if (hd.x <= p.x + 5) col = hd.col;
      if (col) cell[col] = cell[col] ? `${cell[col]} ${p.text.trim()}` : p.text.trim();
    }
    const vin = (cell.vin ?? "").replace(/\s/g, "").toUpperCase();
    const year = Number(cell.year);
    if (!VIN.test(vin) || !(year >= 1950 && year <= 2100) || seen.has(vin)) continue;
    seen.add(vin);
    const link = [cell.link, row.link].find((u) => u && /^https?:\/\//i.test(u)) ?? null;
    cars.push({
      year, make: (cell.make ?? "").trim(), model: (cell.model ?? "").trim(), trim: cell.trim?.trim() || null, vin,
      mileage: digits(cell.mileage), price: digits(cell.price), url: link, stock: cell.stock?.replace(/\s/g, "") || null,
    });
  }
  return cars.filter((c) => c.make);
}

/** The cars in an inventory sheet PDF. Throws "not_pdf" for something that isn't a PDF. */
export function parseInventorySheetPdf(bytes: Uint8Array): SheetCar[] {
  const pages = pdfRows(bytes);
  const withHeader = carsFromRows(pages);
  // Fall back to reading each row as a line of text if the header row can't be found.
  const asText = parseSheetText(pages.map((rows) => rows.map((r) => r.cells.map((c) => c.text.trim()).join(" ")).join("\n")).join("\n"));
  return withHeader.length >= asText.length ? withHeader : asText;
}
