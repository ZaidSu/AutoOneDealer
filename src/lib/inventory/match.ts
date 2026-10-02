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
};

export type Page = { listings: Listing[]; total: number | null; pages: number | null };

const SITE = "https://www.autoonemotorstx.com";
const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (s: string | undefined) => (s ? Number(s.replace(/[^\d]/g, "")) || null : null);

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
      sold: /\bsold\b/i.test(cardText),
    };
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
  const fits = listings.filter((l) => l.year === year && tokens(l.slug).every((t) => have.has(t)));
  const best = Math.max(0, ...fits.map((l) => tokens(l.slug).length));
  return fits.filter((l) => tokens(l.slug).length === best);
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

export function describeListing(l: Listing): string {
  return `${l.title || `${l.year ?? ""} ${l.slug.replace(/-/g, " ")}`.trim()}${l.price ? `, $${l.price.toLocaleString("en-US")}` : ""}${l.mileage ? `, ${l.mileage.toLocaleString("en-US")} miles` : ""} (${l.url})`;
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
