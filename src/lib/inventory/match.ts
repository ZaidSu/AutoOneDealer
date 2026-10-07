// Reading the dealership website's inventory pages and matching a customer's vehicle against them.
// Pure functions (no network, no database) so they can be tested with saved page text.

export type Listing = {
  /** The number at the end of the details link, e.g. 130457967. */
  id: string;
  /** The id on that listing's "Apply for Financing" link (often the same number the lead emails call the stock number). */
  financeId: string | null;
  url: string;
  year: number | null;
  /** "acura-integra": the make and model as the website's link spells them. */
  slug: string;
  title: string;
  price: number | null;
  mileage: number | null;
  /** True only if the listing card itself says Sold. */
  sold: boolean;
  /** The car's photo on the list page (a small version). */
  image?: string | null;
  /** The car's VIN, once its own page has been read. */
  vin?: string | null;
};

export type Page = { listings: Listing[]; total: number | null; pages: number | null };

const SITE = "https://www.autoonemotorstx.com";
const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (s: string | undefined) => (s ? Number(s.replace(/[^\d]/g, "")) || null : null);

const PHOTO = /https?:\/\/cdn\d+\.carsforsale\.com\/(?!dealerlogos)[^"'\s)\\]+?\.(?:jpe?g|png|webp)/i;
/** The first car photo in a piece of page HTML (not the dealership logo). */
const imageIn = (html: string): string | null => PHOTO.exec(html)?.[0] ?? null;

/** True only if the card itself carries a Sold marker: the price reads "Sold", or a badge whose whole text is "Sold".
 *  The word appearing anywhere else (a description, "sold as-is", the footer after the last car) doesn't count. */
const soldBadge = (card: string, cardText: string) => /\bPrice\s+Sold\b/i.test(cardText) || /<[^>]+>\s*Sold(?:\s+Out)?\s*<\//i.test(card);

/** Pulls every car out of one inventory page. */
export function parseInventoryPage(html: string): Page {
  const plain = text(html);
  const range = /Results\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i.exec(plain);
  const total = Number(range?.[3]) || null;
  const perPage = range ? Number(range[2]) - Number(range[1]) + 1 : 0;
  // How many pages: the website says so ("Page 1 of 4"), or it can be worked out from "Results 1 - 24 of 83".
  const pages = Number(/Page\s+\d+\s+of\s+(\d+)/i.exec(plain)?.[1]) || (total && perPage > 0 ? Math.ceil(total / perPage) : null);

  const link = /<a\b[^>]*?href="([^"]*\/details\/([a-z0-9-]+)\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const hits = [...html.matchAll(link)].map((m) => ({ at: m.index ?? 0, href: m[1], slug: m[2], id: m[3], label: text(m[4]) }));
  const byId = new Map<string, Listing>();
  hits.forEach((hit, i) => {
    // The card runs from this link to the next car's link (or a sensible limit at the end of the page).
    const next = hits.slice(i + 1).find((h) => h.id !== hit.id);
    const card = html.slice(hit.at, Math.min(next?.at ?? html.length, hit.at + 6000));
    const cardText = text(card.split(/Page\s+\d+\s+of/i)[0]);
    const existing = byId.get(hit.id);
    const m = /^(?:[a-z]+-)?(\d{4})-(.+)$/.exec(hit.slug);
    const listing: Listing = existing ?? {
      id: hit.id,
      financeId: /finance\?id=(\d+)/i.exec(card)?.[1] ?? null,
      url: hit.href.startsWith("http") ? hit.href : `${SITE}${hit.href}`,
      year: m ? Number(m[1]) : null,
      slug: m ? m[2] : hit.slug,
      title: "",
      price: num(/Price\s+\$\s*([\d,]+)/i.exec(cardText)?.[1]),
      mileage: num(/Mileage\s+([\d,]+)/i.exec(cardText)?.[1]),
      sold: soldBadge(card, cardText),
      image: null,
    };
    if (!listing.image) listing.image = imageIn(card);
    if (hit.label && hit.label.length > listing.title.length) listing.title = hit.label;
    byId.set(hit.id, listing);
  });
  return { listings: [...byId.values()], total, pages };
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** "2023 Acura Integra w/A-SPEC" -> { year: 2023, words: [...] }. */
export function readVehicle(vehicle: string | null | undefined): { year: number | null; words: string[] } {
  const raw = String(vehicle ?? "");
  const year = Number(/\b((?:19|20)\d{2})\b/.exec(raw)?.[1]) || null;
  return { year, words: tokens(raw.replace(/\b(?:19|20)\d{2}\b/, " ")) };
}

/** Listings that are the same year, make and model as the vehicle (the most specific model name wins, so
 *  "Accord Hybrid" doesn't also match plain "Accord"). */
export function sameModel(vehicle: string | null | undefined, listings: Listing[]): Listing[] {
  const { year, words } = readVehicle(vehicle);
  if (!year || words.length < 2) return [];
  const have = new Set(words);
  const sameYear = listings.filter((l) => l.year === year);
  const fits = sameYear.filter((l) => tokens(l.slug).every((t) => have.has(t)));
  if (fits.length) {
    const best = Math.max(0, ...fits.map((l) => tokens(l.slug).length));
    return fits.filter((l) => tokens(l.slug).length === best);
  }
  // Leads often name a car differently from the website ("BMW 328" vs "BMW 3 Series 328i"). Same year and make, and every
  // other word either matches a word in the car's name or starts one (328 -> 328i).
  const make = words[0];
  const rest = words.slice(1);
  return sameYear.filter((l) => {
    if (tokens(l.slug)[0] !== make) return false;
    const name = tokens(l.title.replace(/^\s*(?:19|20)\d{2}\s+/, ""));
    return rest.every((w) => name.some((t) => t === w || (w.length >= 3 && t.startsWith(w))));
  });
}

/** Cars of the same make (and model if possible), for "here's something similar". */
export function similarTo(vehicle: string | null | undefined, listings: Listing[], max = 3): Listing[] {
  const { year, words } = readVehicle(vehicle);
  if (words.length < 1) return [];
  const make = words[0];
  const ofMake = listings.filter((l) => !l.sold && tokens(l.slug)[0] === make);
  const model = ofMake.filter((l) => tokens(l.slug).slice(1).some((t) => words.includes(t)));
  const pool = model.length ? model : ofMake;
  return [...pool].sort((a, b) => Math.abs((a.year ?? 0) - (year ?? 0)) - Math.abs((b.year ?? 0) - (year ?? 0))).slice(0, max);
}

/** Does a car's own page show this VIN (all 17 characters, or the last 6 that some lead emails give)? */
export function pageShowsVin(html: string, vin: string): "yes" | "no" | "cannot tell" {
  const v = vin.trim().toUpperCase();
  const plain = text(html).toUpperCase();
  if (!/\b[A-HJ-NPR-Z0-9]{17}\b/.test(plain)) return "cannot tell"; // the page doesn't print VINs, so it proves nothing
  if (v.length === 17) return plain.includes(v) ? "yes" : "no";
  if (v.length === 6) return new RegExp(`[A-HJ-NPR-Z0-9]{11}${v}\\b`).test(plain) ? "yes" : "no";
  return "cannot tell";
}

/** Reads one car's own page: its VIN and all of its photos. The website's page layout wasn't available when this was written,
 *  so the VIN is looked for in three places (structured data, a "VIN" label, any 17-character VIN printed on the page) and the
 *  photos are the ones in the same image folder as the car's photo on the list page. */
export function parseDetailPage(html: string, listImage: string | null): { vin: string | null; images: string[] } {
  const VIN = "[A-HJ-NPR-Z0-9]{17}";
  const plain = text(html);
  const vin =
    new RegExp(`"(?:vin|vehicleIdentificationNumber)"\\s*:\\s*"(${VIN})"`, "i").exec(html)?.[1]?.toUpperCase() ??
    new RegExp(`\\bVIN\\b[^A-Za-z0-9]{0,12}(${VIN})\\b`, "i").exec(plain)?.[1]?.toUpperCase() ??
    (plain.toUpperCase().match(new RegExp(`\\b${VIN}\\b`, "g")) ?? []).find((v) => /\d/.test(v) && /[A-Z]/.test(v)) ??
    null;
  let folder: string | null = null;
  try { folder = listImage ? new URL(listImage).pathname.split("/")[1] || null : null; } catch { /* no folder to match on */ }
  const byKey = new Map<string, string>();
  for (const u of html.match(new RegExp(PHOTO.source, "gi")) ?? []) {
    if (folder && !u.includes(`/${folder}/`)) continue;
    const key = u.replace(/\/\d+x\d+\//, "/"); // the same photo in different sizes counts once
    const have = byKey.get(key);
    const size = (s: string) => Number(/\/(\d+)x\d+\//.exec(s)?.[1] ?? 0);
    if (!have || size(u) > size(have)) byKey.set(key, u); // keep the biggest version
  }
  let images = [...byKey.values()].slice(0, 25);
  if (images.length === 0 && listImage) images = [listImage];
  return { vin, images };
}

export const SITE_PAGE = "https://www.autoonemotorstx.com/cars-for-sale";

/** The last 6 characters of a VIN, enough to tell two cars of the same model apart. */
export const vinTail = (vin: string | null | undefined) => (vin && vin.length >= 6 ? vin.slice(-6).toUpperCase() : null);

export function describeListing(l: Listing): string {
  return `${l.title || `${l.year ?? ""} ${l.slug.replace(/-/g, " ")}`.trim()}${l.price ? `, $${l.price.toLocaleString("en-US")}` : ""}${l.mileage ? `, ${l.mileage.toLocaleString("en-US")} miles` : ""}${vinTail(l.vin) ? `, VIN ending ${vinTail(l.vin)}` : ""} (${l.url || SITE_PAGE})`;
}

const MULTI_WORD_MAKES = ["Land Rover", "Alfa Romeo", "Aston Martin", "Rolls Royce", "Mercedes Benz"];
const ACRONYM = /^(cts|tlx|rdx|mdx|ilx|rlx|ats|srx|gt|gx|gs|is|es|ls|lx|nx|rx|ux|rc|lc|hr|cr|br|wr|fr|ev|xl|se|le|xle|sr|rs|sl|slt|ltz|rst|ss|zr|srt|tdi|gti|suv)$/i;

const cap = (t: string) => (/\d/.test(t) || ACRONYM.test(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

/** "2023 Acura Integra w/A-SPEC" + slug "acura-integra" -> { make: "Acura", model: "Integra" }. */
export function makeAndModel(listing: { title: string; slug: string; year: number | null }): { make: string; model: string } {
  const bare = listing.title.replace(/^\s*(?:19|20)\d{2}\s+/, "").trim();
  const multi = MULTI_WORD_MAKES.find((m) => bare.toLowerCase().startsWith(m.toLowerCase()));
  const slugTokens = tokens(listing.slug);
  const make = multi ?? (bare.split(/\s+/)[0] || (slugTokens[0] ? cap(slugTokens[0]) : "Unknown"));
  const makeTokens = new Set(tokens(make));
  const rest = slugTokens.filter((t, i) => !(i < makeTokens.size && makeTokens.has(t)));
  let model = rest.map(cap).join(" ");
  model = model.replace(/\b([A-Za-z]{1,2}) ([A-Za-z]{1,2})\b/, "$1-$2").replace(/^([A-Za-z]) (\d)/, "$1-$2"); // "Hr V" -> "HR-V", "F 150" -> "F-150"
  return { make, model };
}

/** Several pages of the website combined into one list. `missing` is how many pages couldn't be read. Complete only if every
 *  page was read and the number of cars matches what the website says it has. */
export function combinePages(pages: Page[], missing = 0): { listings: Listing[]; complete: boolean } {
  const byId = new Map<string, Listing>();
  for (const page of pages) for (const l of page.listings) byId.set(l.id, l);
  const listings = [...byId.values()];
  const first = pages[0];
  // If the page says neither how many pages nor how many cars there are, there's no way to know everything was read.
  const known = Boolean(first) && (first.pages != null || first.total != null);
  const complete = known && missing === 0 && pages.length >= (first.pages ?? 1) && (first.total == null || listings.length >= first.total);
  return { listings, complete };
}

export type PageStore = Record<string, { at: number; page: Page }>;
/** Pages read in earlier runs (recent enough) plus the ones read just now, combined. Lets a read that gets pages 1 and 2 this
 *  time and 3 and 4 the next time still add up to the whole website. */
export function mergePageStore(saved: PageStore, parts: { n: number; page: Page }[], now: number, maxAgeMs: number):
  { store: PageStore; listings: Listing[]; complete: boolean; read: number; expected: number } {
  const store: PageStore = {};
  for (const [n, v] of Object.entries(saved)) if (now - v.at < maxAgeMs) store[n] = v;
  for (const { n, page } of parts) store[String(n)] = { at: now, page };
  const have = Object.keys(store).map(Number).filter((n) => n >= 1);
  const first = store["1"]?.page;
  const expected = first?.pages ?? (have.length ? Math.max(...have) : 1);
  const ordered: Page[] = [];
  for (let n = 1; n <= expected; n++) if (store[String(n)]) ordered.push(store[String(n)].page);
  const { listings, complete } = combinePages(ordered, expected - ordered.length);
  return { store, listings, complete, read: ordered.length, expected };
}

/** Which pages (2 and up) to read this run: the ones with no recent copy first, then the oldest copies. Reading only a couple per
 *  run is gentler on the website, and over a few runs every page gets a fresh copy. Page 1 is always read separately. */
export function pagesToRead(expected: number, saved: PageStore, now: number, maxAgeMs: number, max: number): number[] {
  const candidates: { n: number; at: number }[] = [];
  for (let n = 2; n <= expected; n++) {
    const entry = saved[String(n)];
    candidates.push({ n, at: entry && now - entry.at < maxAgeMs ? entry.at : -Infinity });
  }
  return candidates.sort((a, b) => a.at - b.at || a.n - b.n).slice(0, max).map((c) => c.n);
}

export type PastedCar = { year: number; title: string; header: string; slug: string; make: string; model: string; price: number | null; mileage: number | null; sold: boolean };

/** Reads cars out of text copied from the website's inventory pages (select all, copy, paste). Several pages can be pasted
 *  one after another. `total` is the "of 82" the website prints, so a partial paste can be told from a whole one. */
export function parsePastedInventory(text: string): { cars: PastedCar[]; total: number | null } {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\u200c|\u200b/g, "").trim()).filter(Boolean);
  let total: number | null = null;
  for (const l of lines) { const m = /Results\s+\d+\s*-\s*\d+\s+of\s+(\d+)/i.exec(l); if (m) total = Math.max(total ?? 0, Number(m[1])); }
  const cars: PastedCar[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const head = /^((?:19|20)\d{2})\s+(.+?)\s+for sale at\b/i.exec(lines[i]);
    if (!head) continue;
    const year = Number(head[1]);
    const header = `${head[1]} ${head[2]}`;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length && !/\bfor sale at\b/i.test(lines[j]) && !/^Page\s+\d+\s+of\s+\d+/i.test(lines[j]) && !/^Popular Body Styles/i.test(lines[j]); j++) block.push(lines[j]);
    const after = (label: string) => { const k = block.findIndex((l) => l.toLowerCase() === label); return k >= 0 ? block[k + 1] : undefined; };
    const priceText = after("price") ?? "";
    const sold = /^sold$/i.test(priceText);
    const digits = (t: string | undefined) => { const n = Number((t ?? "").replace(/[^\d]/g, "")); return n > 0 ? n : null; };
    const title = block[0] && /^(?:19|20)\d{2}\s/.test(block[0]) ? block[0] : header;
    const slug = header.replace(/^\s*(?:19|20)\d{2}\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { make, model } = makeAndModel({ title: header, slug, year });
    const mileage = digits(after("mileage"));
    const key = `${title.toLowerCase()}|${mileage}|${sold}`;
    if (seen.has(key)) continue; // the same page pasted twice
    seen.add(key);
    cars.push({ year, title, header, slug, make, model, price: sold ? null : digits(priceText), mileage, sold });
  }
  return { cars, total };
}
