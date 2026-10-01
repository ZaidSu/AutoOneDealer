// Reading the dealership website's inventory pages (autoonemotorstx.com/cars-for-sale and its numbered pages).
// First tries the website directly. Some websites turn away traffic from cloud servers like Vercel, so if that fails it
// asks a free "reader" service (INVENTORY_PROXY_URL, default r.jina.ai) to fetch the page and hand back its HTML.
// Set INVENTORY_PROXY_URL to "off" to turn the helper off.
import { parseInventoryPage, type Listing } from "./match";

const SITE = process.env.INVENTORY_URL || "https://www.autoonemotorstx.com/cars-for-sale";
const PROXY_RAW = process.env.INVENTORY_PROXY_URL || "https://r.jina.ai/";
const PROXY = /^https:\/\//.test(PROXY_RAW.trim()) ? PROXY_RAW.trim() : "";
export const TTL_MS = 10 * 60_000;
const DIRECT_MS = 8_000;
const PROXY_MS = 20_000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1",
};

/** Page 1 is the plain inventory page; the rest use the numbered-page address with every car included. */
const pageUrl = (n: number) => n <= 1 ? SITE
  : `${SITE}?PageNumber=${n}&Sort=MakeAsc&StockNumber=&Condition=&BodyStyle=&Make=&MaxPrice=&Mileage=&SoldStatus=AllVehicles&StockNumber=`;

export type Via = "direct" | "helper";

const why = (error: unknown, ms: number) => {
  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return `no answer after ${Math.round(ms / 1000)} seconds`;
  return error instanceof Error ? error.message : String(error);
};

async function request(url: string, via: Via): Promise<string> {
  const ms = via === "direct" ? DIRECT_MS : PROXY_MS;
  const response = await fetch(via === "direct" ? url : `${PROXY}${url}`, {
    cache: "no-store",
    headers: via === "direct" ? HEADERS : { Accept: "text/html", "X-Return-Format": "html", "X-No-Cache": "true" },
    signal: AbortSignal.timeout(ms),
  }).catch((error) => { throw new Error(why(error, ms)); });
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? `blocked (${response.status})` : `error ${response.status}`);
  const html = await response.text();
  if (!/details\//.test(html) && !/Results\s+\d/i.test(html)) throw new Error("the page came back without any cars in it");
  return html;
}

/** One page, the best way available. Used for a single car's own page (VIN checks). */
export async function getHtml(url: string): Promise<string> {
  try { return await request(url, "direct"); } catch (direct) {
    if (!PROXY) throw direct;
    return request(url, "helper");
  }
}

export type Inventory = { listings: Listing[]; complete: boolean; fetchedAt: number; via: Via };

/** Every car on the website, read fresh. `complete` is true only if every page was read and the count matches what the site says. */
export async function fetchInventory(): Promise<Inventory> {
  let via: Via = "direct";
  let firstHtml: string;
  try { firstHtml = await request(pageUrl(1), "direct"); } catch (direct) {
    if (!PROXY) throw new Error(`The website didn't answer: ${direct instanceof Error ? direct.message : direct}`);
    try { firstHtml = await request(pageUrl(1), "helper"); via = "helper"; } catch (helper) {
      throw new Error(`Couldn't read the website. Directly: ${direct instanceof Error ? direct.message : direct}. Through the helper service: ${helper instanceof Error ? helper.message : helper}`);
    }
  }
  const first = parseInventoryPage(firstHtml);
  const pages = Math.min(first.pages ?? 1, 15);
  const rest = await Promise.allSettled(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => request(pageUrl(i + 2), via).then(parseInventoryPage)));
  const byId = new Map<string, Listing>();
  for (const l of first.listings) byId.set(l.id, l);
  let failed = 0;
  for (const r of rest) {
    if (r.status === "fulfilled") r.value.listings.forEach((l) => byId.set(l.id, l));
    else failed++;
  }
  const listings = [...byId.values()];
  if (listings.length === 0) throw new Error("No cars found on the page (the website layout may have changed)");
  const complete = failed === 0 && (first.total == null || listings.length >= first.total);
  return { listings, complete, fetchedAt: Date.now(), via };
}

let cached: Inventory | null = null;
/** A live read, remembered for 10 minutes. The fallback when the saved copy in the database is too old. */
export async function loadInventory(): Promise<Inventory | null> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  try {
    cached = await fetchInventory();
    return cached;
  } catch (error) {
    console.error("[autodash:inventory] couldn't read the website:", error instanceof Error ? error.message : error);
    return cached;
  }
}
