// Reads the dealership website's inventory from THIS computer and sends it to AutoDash.
// Needs Node 18 or newer. No installs. Run it:  node tools/push-inventory.mjs
//
// Settings (environment variables):
//   AUTODASH_URL          your AutoDash address, e.g. https://auto-one-dealer.vercel.app
//   INVENTORY_PUSH_TOKEN  the same secret you saved in Vercel with that name
//   INVENTORY_SOURCE_URL  optional, the website's inventory page (default: autoonemotorstx.com/cars-for-sale)

const SOURCE = process.env.INVENTORY_SOURCE_URL || "https://www.autoonemotorstx.com/cars-for-sale";
const AUTODASH = (process.env.AUTODASH_URL || "").replace(/\/$/, "");
const TOKEN = process.env.INVENTORY_PUSH_TOKEN || "";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

if (!AUTODASH || !TOKEN) {
  console.error("Missing settings. Set AUTODASH_URL and INVENTORY_PUSH_TOKEN first (see tools/README-inventory.md).");
  process.exit(2);
}

const pageUrl = (n) => n <= 1 ? SOURCE
  : `${SOURCE}?PageNumber=${n}&Sort=MakeAsc&StockNumber=&Condition=&BodyStyle=&Make=&MaxPrice=&Mileage=&SoldStatus=AllVehicles&StockNumber=`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Scripts and styles aren't needed and make the upload large.
const slim = (html) => html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/\s{2,}/g, " ");

/** The page's HTML, or null if the page loaded but has no cars on it (past the last page). Network problems throw. */
async function get(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`the website answered ${res.status}`);
      const html = await res.text();
      return /details\//.test(html) ? html : null;
    } catch (error) { last = error; await sleep(2000 * attempt); }
  }
  throw new Error(`${url}: ${last instanceof Error ? last.message : last}`);
}

/** How many pages the website has: from "Page 1 of N", or worked out from "Results 1 - 24 of 83". */
function pageCount(html) {
  const text = html.replace(/<[^>]+>/g, " ");
  const explicit = Number(/Page\s+\d+\s+of\s+(\d+)/i.exec(text)?.[1]);
  if (explicit) return explicit;
  const range = /Results\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i.exec(text);
  return range ? Math.ceil(Number(range[3]) / (Number(range[2]) - Number(range[1]) + 1)) : 1;
}

try {
  const first = await get(pageUrl(1));
  if (!first) throw new Error("the first page had no cars in it (the website may be blocking this computer, or its layout changed)");
  const pages = pageCount(first);
  const htmls = [slim(first)];
  for (let n = 2; n <= Math.min(pages, 30); n++) {
    await sleep(1000);
    const html = await get(pageUrl(n));
    if (!html) break; // past the last page
    htmls.push(slim(html));
  }
  console.log(`The website has ${pages} page${pages === 1 ? "" : "s"}. Read ${htmls.length}.`);

  const res = await fetch(`${AUTODASH}/api/inventory/push`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ pages: htmls }), signal: AbortSignal.timeout(60_000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(`AutoDash said: ${out.error || res.status}`);
  console.log(`Sent to AutoDash: ${out.count} cars${out.complete ? "" : " (some pages were missing)"}${out.added ? `, ${out.added} new` : ""}${out.sold ? `, ${out.sold} newly sold` : ""}.`);
} catch (error) {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
