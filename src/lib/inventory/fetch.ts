// Reading the dealership website's inventory pages (autoonemotorstx.com/cars-for-sale and its numbered pages).
// First tries the website directly. Some websites turn away traffic from cloud servers like Vercel, so if that fails it
// asks a free "reader" service (INVENTORY_PROXY_URL, default r.jina.ai) to fetch the page and hand back its HTML.
// Set INVENTORY_PROXY_URL to "off" to turn the helper off.
import { combinePages, parseInventoryPage, type Listing } from "./match";

const SITE = process.env.INVENTORY_URL || "https://www.autoonemotorstx.com/cars-for-sale";
const PROXY_RAW = process.env.INVENTORY_PROXY_URL || "https://r.jina.ai/";
const PROXY = /^https:\/\//.test(PROXY_RAW.trim()) ? PROXY_RAW.trim() : "";
export const TTL_MS = 10 * 60_000;
const DIRECT_MS = 18_000;
const PROXY_MS = 22_000;
const BUDGET_MS = 50_000; // the whole read must finish inside this
const MAX_PAGES = 30; // 30 pages is over 700 cars
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

export type Via = "direct" | "helper" | "pushed";

const why = (error: unknown, ms: number) => {
  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return `no answer after ${Math.round(ms / 1000)} seconds`;
  return error instanceof Error ? error.message : String(error);
};

async function request(url: string, via: Via): Promise<string> {
  const ms = via === "helper" ? PROXY_MS : DIRECT_MS;
  const response = await fetch(via === "helper" ? `${PROXY}${url}` : url, {
    cache: "no-store",
    headers: via !== "helper" ? HEADERS : { Accept: "text/html", "X-Return-Format": "html", "X-No-Cache": "true" },
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
  const deadline = Date.now() + BUDGET_MS;
  let via: Via = "direct";
  let firstHtml: string;
  try { firstHtml = await request(pageUrl(1), "direct"); } catch (direct) {
    if (!PROXY) throw new Error(`The website didn't answer: ${direct instanceof Error ? direct.message : direct}`);
    try { firstHtml = await request(pageUrl(1), "helper"); via = "helper"; } catch (helper) {
      throw new Error(`Couldn't read the website. Directly: ${direct instanceof Error ? direct.message : direct}. Through the helper service: ${helper instanceof Error ? helper.message : helper}`);
    }
  }
  const first = parseInventoryPage(firstHtml);
  const pages = [first];
  let missing = 0;
  // One page at a time with a short pause (asking for all of them at once can look like an attack to the website), and
  // one retry if a page doesn't answer.
  for (let n = 2; n <= Math.min(first.pages ?? 1, MAX_PAGES); n++) {
    let got: ReturnType<typeof parseInventoryPage> | null = null;
    for (let attempt = 0; attempt < 2 && !got && Date.now() < deadline - 5_000; attempt++) {
      try { got = parseInventoryPage(await request(pageUrl(n), via)); } catch { await new Promise((r) => setTimeout(r, 1_500)); }
    }
    if (got && got.listings.length === 0) break; // past the last page
    if (got) pages.push(got); else missing++;
    await new Promise((r) => setTimeout(r, 700));
  }
  const { listings, complete } = combinePages(pages, missing);
  if (listings.length === 0) throw new Error("No cars found on the page (the website layout may have changed)");
  return { listings, complete, fetchedAt: Date.now(), via };
}

/** The same thing, from page HTML that the dealership's own computer downloaded and sent to AutoDash. */
export function inventoryFromHtml(htmls: string[]): Inventory {
  const pages = htmls.map(parseInventoryPage);
  const { listings, complete } = combinePages(pages);
  if (listings.length === 0) throw new Error("No cars found in the pages that were sent");
  return { listings, complete, fetchedAt: Date.now(), via: "pushed" };
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
