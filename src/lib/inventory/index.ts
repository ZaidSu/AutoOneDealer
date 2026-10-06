// "Is this car still for sale?" The AI checks the dealership's inventory instead of guessing. It reads the copy of the
// website saved in the database (refreshed every 5 minutes); if that's too old it reads the website directly. A car
// that's listed is available; one that isn't is "may be sold, please call". If neither can be read, the AI says a
// salesperson will confirm (never "sold").
import { loadInventory, TTL_MS, getHtml, type Inventory } from "./fetch";
import { describeListing, pageShowsVin, sameModel, similarTo, type Listing } from "./match";
import { readSnapshot } from "./store";

export { type Listing } from "./match";

export type Availability =
  | { status: "available"; match: Listing; exact: boolean }
  | { status: "maybe_sold"; similar: Listing[]; wasListed: Listing | null; confirmed: boolean }
  | { status: "unknown"; reason: string };

type Snapshot = Omit<Inventory, "via"> & { sold: Listing[]; source: "saved" | "live" };

async function snapshot(): Promise<Snapshot | null> {
  const saved = await readSnapshot().catch(() => null);
  if (saved) return { ...saved, source: "saved" };
  const live = await loadInventory();
  // A live copy older than 30 minutes is too old to say a car is gone.
  return live && Date.now() - live.fetchedAt < TTL_MS * 3 ? { ...live, sold: [], source: "live" } : null;
}

/** Looks a customer's car up. vin may be the full VIN or the last 6; stock is the lead's stock number. */
export async function checkAvailability(vehicle: string | null | undefined, { vin, stock }: { vin?: string | null; stock?: string | null } = {}): Promise<Availability> {
  if (!vehicle?.trim() && !stock && !vin) return { status: "unknown", reason: "No car was named" };
  const inv = await snapshot();
  if (!inv) return { status: "unknown", reason: "The website couldn't be checked right now" };

  const live = inv.listings.filter((l) => !l.sold);
  const stockId = String(stock ?? "").replace(/\D/g, "");
  if (stockId.length >= 6) {
    const byStock = live.find((l) => l.id === stockId || l.financeId === stockId);
    if (byStock) return { status: "available", match: byStock, exact: true };
  }

  const candidates = sameModel(vehicle, live);
  const wanted = String(vin ?? "").replace(/\s/g, "");
  // Saved VINs settle it without asking the website: the lead's full VIN or last 6 against the cars' own VINs.
  if (wanted.length === 17 || wanted.length === 6) {
    const known = live.filter((l) => l.vin);
    const byVin = known.find((l) => (wanted.length === 17 ? l.vin!.toUpperCase() === wanted.toUpperCase() : l.vin!.toUpperCase().endsWith(wanted.toUpperCase())));
    if (byVin) return { status: "available", match: byVin, exact: true };
  }
  // A VIN pins down the exact car: look at the candidates' own pages for it.
  if (candidates.length && (wanted.length === 17 || wanted.length === 6)) {
    const checks = await Promise.allSettled(candidates.slice(0, 6).map(async (l) => ({ l, shows: pageShowsVin(await getHtml(l.url), wanted) })));
    const hit = checks.find((c) => c.status === "fulfilled" && c.value.shows === "yes");
    if (hit && hit.status === "fulfilled") return { status: "available", match: hit.value.l, exact: true };
    const allRead = checks.every((c) => c.status === "fulfilled" && c.value.shows !== "cannot tell");
    if (allRead && inv.complete) return { status: "maybe_sold", similar: similarTo(vehicle, live), wasListed: sameModel(vehicle, inv.sold)[0] ?? null, confirmed: false };
  }

  if (candidates.length) return { status: "available", match: candidates[0], exact: candidates.length === 1 };
  // Not on the website. Only say "may be sold" if every page was read; a half-read inventory proves nothing.
  if (!inv.complete) return { status: "unknown", reason: "Only part of the website could be read" };
  if (!vehicle?.trim() || !/\b(?:19|20)\d{2}\b/.test(vehicle)) return { status: "unknown", reason: "The lead didn't name a specific year, make and model" };
  const was = sameModel(vehicle, inv.sold)[0] ?? null;
  return { status: "maybe_sold", similar: similarTo(vehicle, live), wasListed: was, confirmed: false };
}

/** The text the AI gets, so every email and text answers "is it available?" from the inventory instead of guessing. */
export async function availabilityNote(vehicle: string | null | undefined, opts: { vin?: string | null; stock?: string | null; phone?: string } = {}): Promise<string> {
  if (!vehicle?.trim() && !opts.vin && !opts.stock) return "";
  const result = await checkAvailability(vehicle, opts).catch((): Availability => ({ status: "unknown", reason: "The check failed" }));
  const call = opts.phone ? `call us at ${opts.phone}` : "give the dealership a call";
  if (result.status === "available") {
    return `LIVE INVENTORY CHECK (from our website inventory, just now)
RESULT: AVAILABLE. ${result.exact ? "This car" : "A car like this"} is listed for sale on our website right now: ${describeListing(result.match)}.
You may say it is available, share that link, and answer questions about its price and mileage from it. Invite them to come see it soon, since cars sell quickly.`;
  }
  if (result.status === "maybe_sold") {
    const similar = result.similar.length ? `\nSimilar cars that ARE listed right now (offer these, with their links):\n${result.similar.map((l) => `- ${describeListing(l)}`).join("\n")}` : "";
    const was = result.wasListed ? ` It was on our website recently (${describeListing(result.wasListed)}) and is no longer listed.` : "";
    return `LIVE INVENTORY CHECK (from our website inventory, just now)
RESULT: NOT LISTED. ${vehicle ?? "This car"} is not on our website's inventory, so it may be sold.${was}
Tell the customer plainly that this vehicle may be sold, and ask them to ${call} so the team can confirm and help them find something that fits. Do NOT say it is available. Do NOT say it is definitely sold.${similar}`;
  }
  return `LIVE INVENTORY CHECK: could not be done (${result.reason}).
Do not say whether the car is available or sold. Say a salesperson will confirm its availability.`;
}
