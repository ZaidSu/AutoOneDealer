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
