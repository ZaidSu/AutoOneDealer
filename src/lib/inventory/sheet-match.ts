// Matching a car from the inventory sheet to a car already in AutoDash. Pure, so it can be tested.
import type { SheetCar } from "./sheet-parse";

export type ExistingCar = {
  id: string; financeId: string | null; title: string; year: number | null; make: string | null; vin: string | null; price: number | null; mileage: number | null;
  status: string; url: string | null;
};
export type PriceChange = { title: string; from: number; to: number };

export const makeSlug = (make: string, model: string) => `${make} ${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const sheetTitle = (c: { year: number; make: string; model: string; trim: string | null }) => [c.year, c.make, c.model, c.trim].filter(Boolean).join(" ");

const norm = (t: string | null | undefined) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** The number at the end of a website link: https://…/details/used-2024-acura-integra/131781442 -> 131781442. */
export const idFromUrl = (url: string | null | undefined) => /\/(\d{6,})\/?(?:[?#].*)?$/.exec(String(url ?? ""))?.[1] ?? null;

/** The car in `existing` that is this sheet car: same VIN, else the same website link or stock number, else same year, make and mileage.
 *  A car can only be claimed once. Cars on the lot are preferred over ones already sold or removed. */
export function matchSheetCar(car: SheetCar, existing: ExistingCar[], claimed: Set<string>): ExistingCar | null {
  const free = existing.filter((e) => !claimed.has(e.id));
  const rank = (e: ExistingCar) => (e.status === "available" ? 0 : e.status === "unconfirmed" ? 1 : e.status === "sold" ? 2 : 3);
  const pick = (list: ExistingCar[]) => list.sort((a, b) => rank(a) - rank(b))[0] ?? null;
  const byVin = pick(free.filter((e) => e.vin && e.vin.toUpperCase() === car.vin.toUpperCase()));
  if (byVin) return byVin;
  const siteId = idFromUrl(car.url) ?? (car.stock && /^\d{6,}$/.test(car.stock) ? car.stock : null);
  if (siteId) {
    const byId = pick(free.filter((e) => e.id === siteId || e.financeId === siteId));
    if (byId) return byId;
  }
  if (car.mileage == null) return null;
  return pick(free.filter((e) => e.year === car.year && e.mileage === car.mileage && norm(e.make) === norm(car.make)));
}

/** The price change this sheet makes to a car, if any. */
export function priceChanges(existing: ExistingCar, car: SheetCar): PriceChange | null {
  if (existing.price == null || car.price == null || existing.price === car.price) return null;
  return { title: existing.title || sheetTitle(car), from: existing.price, to: car.price };
}
