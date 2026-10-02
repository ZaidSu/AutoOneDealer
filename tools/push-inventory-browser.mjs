// Same job as push-inventory.mjs, but it opens a REAL Chrome (invisible) to read the website, which gets past sites that
// refuse scripts. One-time setup, in the tools folder:  npm install
// Uses the Google Chrome already on this computer, so nothing big is downloaded.
//
// Settings (environment variables): AUTODASH_URL, INVENTORY_PUSH_TOKEN, and optionally
//   INVENTORY_SOURCE_URL  (default: autoonemotorstx.com/cars-for-sale)
//   SHOW_BROWSER=1        (shows the browser window, useful if it keeps failing)
//   BROWSER_CHANNEL       (default "chrome"; use "msedge" for Edge, or "chromium" after: npx playwright install chromium)
import { chromium } from "playwright";

const SOURCE = process.env.INVENTORY_SOURCE_URL || "https://www.autoonemotorstx.com/cars-for-sale";
const AUTODASH = (process.env.AUTODASH_URL || "").replace(/\/$/, "");
const TOKEN = process.env.INVENTORY_PUSH_TOKEN || "";
const CHANNEL = process.env.BROWSER_CHANNEL || "chrome";
if (!AUTODASH || !TOKEN) {
  console.error("Missing settings. Set AUTODASH_URL and INVENTORY_PUSH_TOKEN first (see tools/README-inventory.md).");
  process.exit(2);
}
const pageUrl = (n) => n <= 1 ? SOURCE
  : `${SOURCE}?PageNumber=${n}&Sort=MakeAsc&StockNumber=&Condition=&BodyStyle=&Make=&MaxPrice=&Mileage=&SoldStatus=AllVehicles&StockNumber=`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slim = (html) => html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/\s{2,}/g, " ");
const pageCount = (html) => {
  const text = html.replace(/<[^>]+>/g, " ");
  const explicit = Number(/Page\s+\d+\s+of\s+(\d+)/i.exec(text)?.[1]);
  if (explicit) return explicit;
  const range = /Results\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i.exec(text);
  return range ? Math.ceil(Number(range[3]) / (Number(range[2]) - Number(range[1]) + 1)) : 1;
};

let browser;
try {
  const options = { headless: process.env.SHOW_BROWSER !== "1" };
  browser = CHANNEL === "chromium" ? await chromium.launch(options) : await chromium.launch({ ...options, channel: CHANNEL });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 }, timezoneId: "America/Chicago" });
  const page = await context.newPage();

  /** A page's HTML once the cars have appeared, or null if it has no cars. */
  async function load(url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (response && response.status() >= 400 && response.status() !== 403) throw new Error(`the website answered ${response.status()}`);
        await page.waitForSelector('a[href*="/details/"]', { timeout: 25_000 });
        return await page.content();
      } catch (error) {
        const html = await page.content().catch(() => "");
        if (/Results\s+\d|Page\s+\d+\s+of/i.test(html.replace(/<[^>]+>/g, " ")) && !/details\//.test(html)) return null; // loaded, but no cars: past the last page
        if (attempt === 3) throw new Error(`${url}: ${error instanceof Error ? error.message : error}`);
        await sleep(3000 * attempt);
      }
    }
  }

  const first = await load(pageUrl(1));
  if (!first) throw new Error("the first page had no cars in it");
  const pages = pageCount(first);
  const htmls = [slim(first)];
  for (let n = 2; n <= Math.min(pages, 30); n++) {
    await sleep(1200);
    const html = await load(pageUrl(n));
    if (!html) break;
    htmls.push(slim(html));
  }
  await browser.close(); browser = null;
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
  if (/Executable doesn't exist|channel|chrome/i.test(String(error))) console.error("Couldn't start the browser. Install Google Chrome, or run: npx playwright install chromium   and set BROWSER_CHANNEL=chromium");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
}
