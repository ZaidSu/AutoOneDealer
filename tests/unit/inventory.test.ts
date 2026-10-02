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
