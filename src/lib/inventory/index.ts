// "Is this car still for sale?" Checks the dealership's own inventory pages (autoonemotorstx.com/cars-for-sale and its
// numbered pages) instead of guessing. If a car is listed there it's available; if it isn't, the AI says it may be sold
// and asks the customer to call. If the website can't be read, the AI says a salesperson will confirm (never "sold").
import { describeListing, pageShowsVin, parseInventoryPage, sameModel, similarTo, type Listing } from "./match";

export { type Listing } from "./match";

const SITE = process.env.INVENTORY_URL || "https://www.autoonemotorstx.com/cars-for-sale";
const TTL_MS = 10 * 60_000;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; AutoDash/1.0; +https://auto-one-dealer.vercel.app)", Accept: "text/html" };

/** Page 1 is the plain inventory page; the rest use the numbered-page address with every car included. */
const pageUrl = (n: number) => n <= 1 ? SITE
  : `${SITE}?PageNumber=${n}&Sort=MakeAsc&StockNumber=&Condition=&BodyStyle=&Make=&MaxPrice=&Mileage=&SoldStatus=AllVehicles&StockNumber=`;

async function getHtml(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store", headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`The website returned ${response.status}`);
  return response.text();
}

export type Inventory = { listings: Listing[]; complete: boolean; fetchedAt: number };
let cached: Inventory | null = null;

/** Every car on the website. `complete` is true only if every page was read and the count matches what the site says. */
export async function loadInventory(): Promise<Inventory | null> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  try {
    const first = parseInventoryPage(await getHtml(pageUrl(1)));
    const pages = Math.min(first.pages ?? 1, 15);
    const rest = await Promise.allSettled(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => getHtml(pageUrl(i + 2)).then(parseInventoryPage)));
    const byId = new Map<string, Listing>();
    for (const l of first.listings) byId.set(l.id, l);
    let failed = 0;
    for (const r of rest) {
      if (r.status === "fulfilled") r.value.listings.forEach((l) => byId.set(l.id, l));
      else failed++;
    }
    const listings = [...byId.values()];
    if (listings.length === 0) throw new Error("No cars found on the page (the website may have changed)");
    const complete = failed === 0 && (first.total == null || listings.length >= first.total);
    cached = { listings, complete, fetchedAt: Date.now() };
    return cached;
  } catch (error) {
    console.error("[autodash:inventory] couldn't read the website:", error instanceof Error ? error.message : error);
    return cached; // the last good copy, if any; checkAvailability refuses to trust it once it's too old
  }
}

export type Availability =
  | { status: "available"; match: Listing; exact: boolean }
  | { status: "maybe_sold"; similar: Listing[] }
  | { status: "unknown"; reason: string };

/** Looks a customer's car up on the website. vin may be the full VIN or the last 6; stock is the lead's stock number. */
export async function checkAvailability(vehicle: string | null | undefined, { vin, stock }: { vin?: string | null; stock?: string | null } = {}): Promise<Availability> {
  if (!vehicle?.trim() && !stock && !vin) return { status: "unknown", reason: "No car was named" };
  const inv = await loadInventory();
  // Too old to trust for "it's gone": a stale copy must never turn a car that's still for sale into "sold".
  const fresh = inv && Date.now() - inv.fetchedAt < TTL_MS * 3;
  if (!inv || !fresh) return { status: "unknown", reason: "The website couldn't be checked right now" };

  const live = inv.listings.filter((l) => !l.sold);
  const stockId = String(stock ?? "").replace(/\D/g, "");
  if (stockId.length >= 6) {
    const byStock = live.find((l) => l.id === stockId || l.financeId === stockId);
    if (byStock) return { status: "available", match: byStock, exact: true };
  }

  const candidates = sameModel(vehicle, live);
  const wanted = String(vin ?? "").replace(/\s/g, "");
  // A VIN pins down the exact car: look at the candidates' own pages for it.
  if (candidates.length && (wanted.length === 17 || wanted.length === 6)) {
    const checks = await Promise.allSettled(candidates.slice(0, 6).map(async (l) => ({ l, shows: pageShowsVin(await getHtml(l.url), wanted) })));
    const hit = checks.find((c) => c.status === "fulfilled" && c.value.shows === "yes");
    if (hit && hit.status === "fulfilled") return { status: "available", match: hit.value.l, exact: true };
    const allRead = checks.every((c) => c.status === "fulfilled" && c.value.shows !== "cannot tell");
    if (allRead && inv.complete) return { status: "maybe_sold", similar: similarTo(vehicle, live) };
  }

  if (candidates.length) return { status: "available", match: candidates[0], exact: candidates.length === 1 };
  // Not on the website. Only say "may be sold" if every page was read; a half-read inventory proves nothing.
  if (!inv.complete) return { status: "unknown", reason: "Only part of the website could be read" };
  if (!vehicle?.trim() || !/\b(?:19|20)\d{2}\b/.test(vehicle)) return { status: "unknown", reason: "The lead didn't name a specific year, make and model" };
  return { status: "maybe_sold", similar: similarTo(vehicle, live) };
}

/** The text the AI gets, so every email and text answers "is it available?" from the website instead of guessing. */
export async function availabilityNote(vehicle: string | null | undefined, opts: { vin?: string | null; stock?: string | null; phone?: string } = {}): Promise<string> {
  if (!vehicle?.trim() && !opts.vin && !opts.stock) return "";
  const result = await checkAvailability(vehicle, opts).catch((): Availability => ({ status: "unknown", reason: "The check failed" }));
  const call = opts.phone ? `call us at ${opts.phone}` : "give the dealership a call";
  if (result.status === "available") {
    return `LIVE INVENTORY CHECK (read from our website just now)
RESULT: AVAILABLE. ${result.exact ? "This car" : "A car like this"} is listed for sale on our website right now: ${describeListing(result.match)}.
You may say it is available and share that link. Still invite them to come see it soon, since cars sell quickly.`;
  }
  if (result.status === "maybe_sold") {
    const similar = result.similar.length ? `\nSimilar cars that ARE listed right now (offer these, with their links):\n${result.similar.map((l) => `- ${describeListing(l)}`).join("\n")}` : "";
    return `LIVE INVENTORY CHECK (read from our website just now)
RESULT: NOT LISTED. ${vehicle ?? "This car"} is not on our website's inventory, so it may be sold.
Tell the customer plainly that this vehicle may be sold, and ask them to ${call} so the team can confirm and help them find something that fits. Do NOT say it is available. Do NOT say it is definitely sold.${similar}`;
  }
  return `LIVE INVENTORY CHECK: could not be done (${result.reason}).
Do not say whether the car is available or sold. Say a salesperson will confirm its availability.`;
}
