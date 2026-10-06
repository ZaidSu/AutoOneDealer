import assert from "node:assert/strict";
import { test } from "node:test";
import { pageShowsVin, parseInventoryPage, sameModel, similarTo } from "../../src/lib/inventory/match.ts";

const card = (slug: string, id: string, title: string, price: string, miles: string, extra = "") => `
<li><a href="https://www.autoonemotorstx.com/details/${slug}/${id}"><img alt="${title} for sale at Auto One Motors"></a>
<h3><a href="https://www.autoonemotorstx.com/details/${slug}/${id}">${title}</a></h3>
<div>Price</div><div>$${price}</div><div>Mileage</div><div>${miles}</div>${extra}
<a href="https://www.autoonemotorstx.com/finance?id=9${id.slice(1)}&sourceId=3">Apply for Financing</a></li>`;

const page = `<html><body><h1>Cars For Sale</h1><div>Results 1 - 24 of 83</div>
<select><option>Available</option><option>Sold</option></select>
${card("used-2023-acura-integra", "130457967", "2023 Acura Integra w/A-SPEC", "18,995", "53,827")}
${card("used-2023-acura-integra", "129854874", "2023 Acura Integra w/A-SPEC", "16,995", "31,567")}
${card("used-2021-honda-accord", "130179335", "2021 Honda Accord EX-L", "17,995", "62,817")}
${card("used-2021-honda-accord-hybrid", "130459136", "2021 Honda Accord Hybrid EX", "17,995", "50,673")}
${card("used-2023-ford-f-150", "130080582", "2023 Ford F-150 Lariat", "37,995", "60,457")}
${card("used-2020-honda-civic", "129856244", "2020 Honda Civic Sport", "16,995", "56,786", "<span class=\"badge\">SOLD</span>")}
<ul><li>Page 1 of 4</li></ul></body></html>`;

const { listings, total, pages } = parseInventoryPage(page);

test("reads every car, the totals, and doesn't double count", () => {
  assert.equal(listings.length, 6);
  assert.equal(total, 83);
  assert.equal(pages, 4);
  const first = listings[0];
  assert.equal(first.id, "130457967");
  assert.equal(first.year, 2023);
  assert.equal(first.slug, "acura-integra");
  assert.equal(first.title, "2023 Acura Integra w/A-SPEC");
  assert.equal(first.price, 18995);
  assert.equal(first.mileage, 53827);
  assert.equal(first.financeId, "930457967");
});

test("a card marked sold is flagged, and only that one", () => {
  assert.deepEqual(listings.filter((l) => l.sold).map((l) => l.id), ["129856244"]);
});

test("matching by year, make and model", () => {
  assert.equal(sameModel("2023 Acura Integra", listings).length, 2);
  assert.equal(sameModel("2023 Acura Integra w/A-SPEC", listings).length, 2);
  assert.equal(sameModel("2022 Acura Integra", listings).length, 0); // wrong year
  assert.equal(sameModel("2023 Ford F-150", listings).length, 1); // F-150 spelled the same way
  assert.equal(sameModel("Honda Civic", listings).length, 0); // no year: not specific enough
});

test("Accord and Accord Hybrid are different cars", () => {
  assert.deepEqual(sameModel("2021 Honda Accord", listings).map((l) => l.id), ["130179335"]);
  assert.deepEqual(sameModel("2021 Honda Accord Hybrid", listings).map((l) => l.id), ["130459136"]);
});

test("similar cars are the same make, closest year first", () => {
  const live = listings.filter((l) => !l.sold);
  assert.deepEqual(similarTo("2019 Honda Accord", live, 2).map((l) => l.id), ["130179335", "130459136"]);
  assert.deepEqual(similarTo("2020 Tesla Model 3", live), []);
});

test("VIN check on a car's own page", () => {
  const withVin = "<div>VIN</div><div>1G6AR5SX0E0123456</div>";
  assert.equal(pageShowsVin(withVin, "1G6AR5SX0E0123456"), "yes");
  assert.equal(pageShowsVin(withVin, "123456"), "yes"); // last 6, like Westlake emails
  assert.equal(pageShowsVin(withVin, "1G6AR5SX0E0999999"), "no");
  assert.equal(pageShowsVin("<div>No VIN printed here</div>", "123456"), "cannot tell");
});

import { makeAndModel } from "../../src/lib/inventory/match.ts";
test("make and model are split out of the title and link", () => {
  assert.deepEqual(makeAndModel({ title: "2023 Acura Integra w/A-SPEC", slug: "acura-integra", year: 2023 }), { make: "Acura", model: "Integra" });
  assert.deepEqual(makeAndModel({ title: "2021 Chevrolet Silverado 1500 LTZ", slug: "chevrolet-silverado-1500", year: 2021 }), { make: "Chevrolet", model: "Silverado 1500" });
  assert.deepEqual(makeAndModel({ title: "2023 Ford F-150 Lariat", slug: "ford-f-150", year: 2023 }), { make: "Ford", model: "F-150" });
  assert.deepEqual(makeAndModel({ title: "2021 Genesis G70 2.0T", slug: "genesis-g70", year: 2021 }), { make: "Genesis", model: "G70" });
  assert.deepEqual(makeAndModel({ title: "2020 BMW 3 Series M340i", slug: "bmw-3-series", year: 2020 }), { make: "BMW", model: "3 Series" });
  assert.equal(makeAndModel({ title: "2019 Land Rover Range Rover Sport", slug: "land-rover-range-rover-sport", year: 2019 }).make, "Land Rover");
});

import { combinePages } from "../../src/lib/inventory/match.ts";
test("pages are combined, and only complete when every page was read and the count matches", () => {
  const p1 = parseInventoryPage(page);                                   // says "Page 1 of 4", 83 cars; has 6
  const p2 = { listings: [{ ...listings[0], id: "999" }], total: 83, pages: 4 };
  assert.equal(combinePages([p1], 0).complete, false);                   // only 1 of 4 pages
  assert.equal(combinePages([p1, p2], 2).complete, false);               // 2 pages couldn't be read
  assert.equal(combinePages([p1, p1, p1, p1], 0).complete, false);       // all 4 pages, but 6 cars is not 83
  assert.equal(combinePages([p1, p2], 0).listings.length, 7);
  const small = { listings, total: 6, pages: 1 };
  assert.equal(combinePages([small], 0).complete, true);                 // the whole website is one page of 6 cars
});

test("pages slimmed down by the dealership-computer script read the same", () => {
  const slim = (html: string) => html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/\s{2,}/g, " ");
  const noisy = `<html><head><script>var a = "<li>not a car</li>";</script><style>.x{}</style></head>${page}<!-- x --></html>`;
  const a = parseInventoryPage(page), b = parseInventoryPage(slim(noisy));
  assert.deepEqual(b.listings.map((l) => [l.id, l.price, l.mileage, l.sold]), a.listings.map((l) => [l.id, l.price, l.mileage, l.sold]));
  assert.equal(b.total, 83);
});

test("the page count is worked out even if the website doesn't say 'Page 1 of N'", () => {
  const noPageLine = page.replace("<ul><li>Page 1 of 4</li></ul>", "");
  assert.equal(parseInventoryPage(noPageLine).pages, 4); // "Results 1 - 24 of 83" -> 24 per page -> 4 pages
  const oneOfThree = page.replace("Page 1 of 4", "Page 1 of 3");
  assert.equal(parseInventoryPage(oneOfThree).pages, 3);
});
test("with no page or car count at all, a read is never called complete (so nothing is marked sold)", () => {
  const blind = parseInventoryPage("<a href='https://x.com/details/used-2020-honda-civic/130000001'>2020 Honda Civic</a>");
  assert.equal(blind.pages, null);
  assert.equal(blind.total, null);
  assert.equal(combinePages([blind], 0).complete, false);
});

import { mergePageStore } from "../../src/lib/inventory/match.ts";
test("pages read in different runs add up to the whole website", () => {
  const mk = (n: number, ids: string[]) => ({ listings: ids.map((id) => ({ ...listings[0], id })), total: 8, pages: 4 });
  const T = 1_000_000_000_000, MIN = 60_000;
  // run 1 gets pages 1 and 2
  const r1 = mergePageStore({}, [{ n: 1, page: mk(1, ["a", "b"]) }, { n: 2, page: mk(2, ["c", "d"]) }], T, 25 * MIN);
  assert.equal(r1.complete, false);
  assert.deepEqual([r1.read, r1.expected], [2, 4]);
  // run 2, five minutes later, gets page 1 again and page 3
  const r2 = mergePageStore(r1.store, [{ n: 1, page: mk(1, ["a", "b"]) }, { n: 3, page: mk(3, ["e", "f"]) }], T + 5 * MIN, 25 * MIN);
  assert.equal(r2.complete, false);
  assert.equal(r2.read, 3);
  // run 3 gets page 4: now all four pages are there and the count matches
  const r3 = mergePageStore(r2.store, [{ n: 1, page: mk(1, ["a", "b"]) }, { n: 4, page: mk(4, ["g", "h"]) }], T + 10 * MIN, 25 * MIN);
  assert.equal(r3.complete, true);
  assert.equal(r3.listings.length, 8);
  // but pages that are too old don't count
  const r4 = mergePageStore(r3.store, [{ n: 1, page: mk(1, ["a", "b"]) }], T + 60 * MIN, 25 * MIN);
  assert.equal(r4.complete, false);
  assert.equal(r4.read, 1);
});

import { pagesToRead } from "../../src/lib/inventory/match.ts";
test("each run reads the pages that most need it, a couple at a time", () => {
  const T = 1_000_000_000_000, MIN = 60_000;
  const pg = { listings: [], total: 8, pages: 4 };
  // nothing saved: pages 2 and 3 first
  assert.deepEqual(pagesToRead(4, {}, T, 25 * MIN, 2), [2, 3]);
  // 2 and 3 were just read: 4 is the one missing, then the oldest of the rest
  const store = { "2": { at: T - MIN, page: pg }, "3": { at: T - 2 * MIN, page: pg } };
  assert.deepEqual(pagesToRead(4, store, T, 25 * MIN, 2), [4, 3]);
  // all three are fresh: refresh the oldest two
  const full = { ...store, "4": { at: T, page: pg } };
  assert.deepEqual(pagesToRead(4, full, T, 25 * MIN, 2), [3, 2]);
  // an expired copy counts as missing
  assert.deepEqual(pagesToRead(4, { "2": { at: T - 40 * MIN, page: pg }, "3": { at: T, page: pg }, "4": { at: T, page: pg } }, T, 25 * MIN, 2), [2, 3]);
  // a one-page website needs nothing beyond page 1
  assert.deepEqual(pagesToRead(1, {}, T, 25 * MIN, 2), []);
});

import { readFileSync } from "node:fs";
import { describeListing, parsePastedInventory } from "../../src/lib/inventory/match.ts";
test("text copied from the website's pages is read into cars", () => {
  const { cars, total } = parsePastedInventory(readFileSync(new URL("../fixtures/pasted-inventory.txt", import.meta.url), "utf8"));
  assert.equal(total, 82);
  assert.equal(cars.length, 7);
  const [integra, bmw, silverado, hrv, corolla, malibu, corollaSold] = cars;
  assert.deepEqual([integra.title, integra.year, integra.make, integra.model, integra.price, integra.mileage, integra.sold], ["2023 Acura Integra w/A-SPEC", 2023, "Acura", "Integra", 18995, 53827, false]);
  assert.deepEqual([bmw.make, bmw.model, bmw.slug, bmw.price], ["BMW", "3 Series", "bmw-3-series", 4995]);
  assert.equal(silverado.model, "Silverado 1500");
  assert.equal(hrv.model, "HR-V");
  assert.equal(corolla.sold, false);
  assert.deepEqual([malibu.sold, malibu.price, malibu.mileage], [true, null, 78925]);
  assert.equal(corollaSold.sold, true);                     // the same car name as the one above, told apart by mileage and Sold
  assert.equal(corolla.mileage === corollaSold.mileage, false);
});
test("the same page pasted twice doesn't double the cars", () => {
  const text = readFileSync(new URL("../fixtures/pasted-inventory.txt", import.meta.url), "utf8");
  assert.equal(parsePastedInventory(text + "\n" + text).cars.length, 7);
});
test("a lead's short name finds the website's car: '2011 Bmw 328' is the '2011 BMW 3 Series 328i'", () => {
  const { cars } = parsePastedInventory(readFileSync(new URL("../fixtures/pasted-inventory.txt", import.meta.url), "utf8"));
  const lots = cars.filter((c) => !c.sold).map((c, i) => ({ id: String(i), financeId: null, url: "", year: c.year, slug: c.slug, title: c.title, price: c.price, mileage: c.mileage, sold: false }));
  assert.deepEqual(sameModel("2011 Bmw 328", lots).map((l) => l.title), ["2011 BMW 3 Series 328i"]);
  assert.deepEqual(sameModel("2017 Honda HR-V", lots).map((l) => l.title), ["2017 Honda HR-V LX"]);
  assert.deepEqual(sameModel("2011 Bmw 335", lots), []);         // a different model of the same make is not a match
  assert.deepEqual(sameModel("2012 Bmw 328", lots), []);         // wrong year
  assert.match(describeListing(lots[0]), /autoonemotorstx\.com\/cars-for-sale/); // a car with no page of its own links to the inventory
});

import { SEED, seedText } from "../../src/lib/inventory/seed.ts";
test("the starter inventory matches the website: 82 cars, 4 sold, and the website's own count per make", () => {
  const { cars, total } = parsePastedInventory(seedText());
  assert.equal(total, 82);
  assert.equal(cars.length, 82);
  assert.equal(SEED.length, 82);
  assert.equal(cars.filter((c) => c.sold).length, 4);
  // the website's "Popular Makes" list: the check that every car was copied correctly
  const website: Record<string, number> = { Acura: 5, BMW: 2, Cadillac: 1, Chevrolet: 10, Chrysler: 4, Dodge: 4, Ford: 1, Genesis: 1, GMC: 7, Honda: 22, Jeep: 2, Lexus: 5, Mazda: 1, Nissan: 8, Subaru: 1, Toyota: 8 };
  const ours: Record<string, number> = {};
  for (const c of cars) ours[c.make] = (ours[c.make] ?? 0) + 1;
  assert.deepEqual(ours, website);
  // no two cars share the same name and mileage (that's how they're told apart)
  assert.equal(new Set(cars.map((c) => `${c.title}|${c.mileage}`)).size, 82);
  // and the total of the asking prices on the 78 for sale is a number that can be checked against the website
  assert.equal(cars.filter((c) => !c.sold).length, 78);
});

// ---- photos and VIN (update 51) ----
import { parseDetailPage as detailPage, parseInventoryPage as listPage } from "../../src/lib/inventory/match.ts";

test("list page: the car's photo is read from its card, not the dealership logo", () => {
  const html = `<img src="https://cdn07.carsforsale.com/dealerlogos/1041217/logo.png">
    <li><a href="https://www.autoonemotorstx.com/details/used-2023-acura-integra/130457967"><img alt="2023 Acura Integra for sale" src="https://cdn05.carsforsale.com/00feae2b/480x360/2023-acura-integra.jpg"></a>
    <h3><a href="https://www.autoonemotorstx.com/details/used-2023-acura-integra/130457967">2023 Acura Integra w/A-SPEC</a></h3> Price $18,995 Mileage 53,827</li>`;
  const [car] = listPage(html).listings;
  assert.equal(car.image, "https://cdn05.carsforsale.com/00feae2b/480x360/2023-acura-integra.jpg");
  assert.equal(car.price, 18995);
});

test("car page: VIN from structured data, a VIN label or the page text; photos from the car's own folder, biggest size once each", () => {
  const photos = `<img src="https://cdn05.carsforsale.com/h1/1024x768/a.jpg"><img src="https://cdn05.carsforsale.com/h1/480x360/a.jpg"><img src="https://cdn05.carsforsale.com/h1/1024x768/b.jpg"><img src="https://cdn05.carsforsale.com/other/1024x768/z.jpg"><img src="https://cdn07.carsforsale.com/dealerlogos/1/logo.png">`;
  const thumb = "https://cdn05.carsforsale.com/h1/480x360/a.jpg";
  const a = detailPage(`<script>{"vin":"1HGCM82633A004352"}</script>${photos}`, thumb);
  assert.equal(a.vin, "1HGCM82633A004352");
  assert.deepEqual(a.images, ["https://cdn05.carsforsale.com/h1/1024x768/a.jpg", "https://cdn05.carsforsale.com/h1/1024x768/b.jpg"]);
  assert.equal(detailPage("<body><li>VIN: 2t1br32e84c123456</li></body>", null).vin, "2T1BR32E84C123456");
  assert.equal(detailPage("<body>Stock 55 2T1BR32E84C123456</body>", null).vin, "2T1BR32E84C123456");
  const none = detailPage("<body>No numbers here</body>", thumb);
  assert.equal(none.vin, null);
  assert.deepEqual(none.images, [thumb], "falls back to the list photo");
});

// ---- VIN last 6 (update 53) ----
import { vinTail } from "../../src/lib/inventory/match.ts";
test("the last 6 of the VIN tells two cars of the same model apart in what the AI is given", () => {
  assert.equal(vinTail("1hgcm82633a004352"), "004352");
  assert.equal(vinTail(null), null);
  assert.equal(vinTail("12345"), null);
  const base = { id: "1", financeId: null, url: "https://www.autoonemotorstx.com/details/used-2019-honda-accord/1", year: 2019, slug: "honda-accord", title: "2019 Honda Accord", price: 21000, mileage: 40000, sold: false };
  assert.match(describeListing({ ...base, vin: "1HGCV1F34KA123456" }), /40,000 miles, VIN ending 123456 \(https:/);
  assert.doesNotMatch(describeListing(base), /VIN/, "no VIN known yet: nothing is made up");
});
