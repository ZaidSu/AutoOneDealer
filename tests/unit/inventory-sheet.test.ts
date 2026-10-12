import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { parseInventorySheetPdf, parseSheetText, splitMakeModel, type SheetCar } from "../../src/lib/inventory/sheet-parse.ts";
import { idFromUrl, matchSheetCar, priceChanges, sheetTitle, type ExistingCar } from "../../src/lib/inventory/sheet-match.ts";

const car = (o: Partial<SheetCar>): SheetCar => ({ year: 2021, make: "Acura", model: "TLX", trim: null, vin: "19UUB6F51MA002066", mileage: 62127, price: 22995, url: null, stock: null, ...o });

// A small PDF the way CarsForSale writes it: one text command per cell, placed with Tm; trims carry a link annotation.
const COLS = [["Year", 25], ["Make", 55], ["Model", 145], ["Trim", 235], ["VIN", 330], ["Mileage", 440], ["Price", 500]] as const;
const cells = (y: number, vals: string[]) => vals.map((v, i) => (v ? `1 0 0 1 ${COLS[i][1]} ${y} Tm\n(${v})Tj` : "")).join("\n");
const content = `BT\n${cells(582, COLS.map((c) => c[0]))}\n${cells(567, ["2024", "Acura", "Integra", "w/A-SPEC", "19UDE4H35RA014705", "30,167", "$21,995"])}
${cells(552, ["2023", "Land Rover", "Range Rover Sport", "", "SALWR2RV4NA123456", "31,567", "$61,995"])}
${cells(537, ["2016", "Chevrolet", "Silverado \\(1500\\)", "LT", "3GCUKREH7FG269535", "120,064", "$14,995"])}\nET`;
const LINK = "https://www.autoonemotorstx.com/details/used-2024-acura-integra/131781442";
function pdf(flate: boolean) {
  const body = Buffer.from(content, "latin1");
  const stream = flate ? deflateSync(body) : body;
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj\n"
      + "3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents [ 4 0 R ] /Annots [ 5 0 R ] >>\nendobj\n"
      + `5 0 obj\n<< /Type /Annot /Subtype /Link /Rect [ 233 565 290 575 ] /Border [ 0 0 0 ] /A << /S /URI /URI (${LINK}) >> >>\nendobj\n`
      + `4 0 obj\n<< /Length ${stream.length}${flate ? " /Filter /FlateDecode" : ""} >>\nstream\n`, "latin1"),
    stream, Buffer.from("\nendstream\nendobj\ntrailer\n%%EOF", "latin1")]);
}

test("a sheet row is split into its parts", () => {
  const cars = parseSheetText("Year Make Model VIN Mileage Price\n2021  Acura  TLX  19UUB6F51MA002066  62,127  $22,995\nnot a car\n2021 Acura TLX 19UUB6F51MA002066 62,127 $22,995");
  assert.deepEqual(cars, [car({})]);
  assert.deepEqual(splitMakeModel("Land Rover Range Rover Sport"), { make: "Land Rover", model: "Range Rover Sport" });
  assert.equal(parseSheetText("2020 Honda Civic 2HGFC2F81LH522826 56,786")[0].price, null);
});
for (const flate of [false, true]) {
  test(`reads cars, trims and links out of a PDF (${flate ? "compressed" : "plain"} page)`, () => {
    const cars = parseInventorySheetPdf(pdf(flate));
    assert.equal(cars.length, 3);
    assert.deepEqual(cars[0], { year: 2024, make: "Acura", model: "Integra", trim: "w/A-SPEC", vin: "19UDE4H35RA014705", mileage: 30167, price: 21995, url: LINK, stock: null });
    assert.deepEqual(cars[1], { year: 2023, make: "Land Rover", model: "Range Rover Sport", trim: null, vin: "SALWR2RV4NA123456", mileage: 31567, price: 61995, url: null, stock: null }, "a blank trim is fine");
    assert.equal(cars[2].model, "Silverado (1500)");
    assert.equal(cars[2].trim, "LT");
    assert.equal(sheetTitle(cars[0]), "2024 Acura Integra w/A-SPEC");
  });
}
test("something that isn't a PDF is refused", () => {
  assert.throws(() => parseInventorySheetPdf(Buffer.from("hello")), /not_pdf/);
});

const lot: ExistingCar[] = [
  { id: "130457967", financeId: "130457967", title: "2021 Acura TLX SH-AWD w/A-SPEC", year: 2021, make: "Acura", vin: null, price: 23995, mileage: 62127, status: "available", url: null },
  { id: "130457968", financeId: null, title: "2023 Acura Integra", year: 2023, make: "Acura", vin: "19UDE4H31PA010812", price: 18995, mileage: 53000, status: "available", url: null },
  { id: "131781442", financeId: "999", title: "2024 Acura Integra w/A-SPEC", year: 2024, make: "Acura", vin: null, price: 21995, mileage: 30000, status: "unconfirmed", url: LINK },
];
test("a sheet car matches by VIN, then website link or stock number, then year, make and mileage", () => {
  const claimed = new Set<string>();
  assert.equal(matchSheetCar(car({}), lot, claimed)?.id, "130457967");
  assert.equal(matchSheetCar(car({ year: 2023, model: "Integra", vin: "19UDE4H31PA010812", mileage: 53827 }), lot, claimed)?.id, "130457968", "the VIN wins even though the mileage changed");
  assert.equal(matchSheetCar(car({ year: 2024, model: "Integra", vin: "NEWVIN00000000001", mileage: 31000, url: LINK }), lot, new Set())?.id, "131781442", "matched by the number in the link");
  assert.equal(matchSheetCar(car({ year: 2024, vin: "NEWVIN00000000002", mileage: 31000, stock: "131781442" }), lot, new Set())?.id, "131781442", "matched by stock number");
  assert.equal(matchSheetCar(car({}), lot, new Set(["130457967"])), null, "a car is only claimed once");
  assert.equal(matchSheetCar(car({ year: 2022, make: "Kia", model: "Soul", vin: "Z", mileage: 5 }), lot, new Set()), null);
  assert.equal(idFromUrl(LINK), "131781442");
});
test("price changes are reported", () => {
  assert.deepEqual(priceChanges(lot[0], car({ price: 22995 })), { title: "2021 Acura TLX SH-AWD w/A-SPEC", from: 23995, to: 22995 });
  assert.equal(priceChanges(lot[1], car({ price: 18995 })), null);
});
