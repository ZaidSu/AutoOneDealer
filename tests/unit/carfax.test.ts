import assert from "node:assert/strict";
import { test } from "node:test";
import { carfaxUrl, describeListing, type Listing } from "../../src/lib/inventory/match.ts";
import { parseLead } from "../../src/lib/parsers/leads.ts";

const base = { id: "1", financeId: null, url: "https://www.autoonemotorstx.com/cars/x", year: 2025, make: "Hyundai", model: "Sonata", slug: "hyundai-sonata", title: "2025 Hyundai Sonata", price: 21995, mileage: 39707, image: null, vin: "KMHL54JC5SA442554", sold: false, deposit: false } as unknown as Listing;
const T = "https://www.carfax.com/vehicle/{VIN}";

test("the Carfax link is built from the VIN, only when set up", () => {
  assert.equal(carfaxUrl(T, "kmhl54jc5sa442554"), "https://www.carfax.com/vehicle/KMHL54JC5SA442554");
  assert.equal(carfaxUrl("", "KMHL54JC5SA442554"), null);
  assert.equal(carfaxUrl("https://www.carfax.com/vehicle/", "KMHL54JC5SA442554"), null); // no {VIN} in it
  assert.equal(carfaxUrl(T, null), null);
  assert.equal(carfaxUrl(T, "SHORT"), null);
});

test("the AI is given the full VIN, and the Carfax link when there is one", () => {
  assert.match(describeListing(base), /VIN KMHL54JC5SA442554/);
  assert.doesNotMatch(describeListing(base), /CARFAX/);
  assert.match(describeListing(base, T), /CARFAX report: https:\/\/www\.carfax\.com\/vehicle\/KMHL54JC5SA442554/);
});

test("a Carfax lead email is saved as a lead, even when the subject doesn't say lead", () => {
  const lead = parseLead({
    from: "Carfax <leads@carfax.com>", subject: "A shopper is interested in 2019 Toyota Camry SE",
    text: "Name: Sam Rivera\nPhone: (214) 555-0182\nEmail: sam@example.com\nVehicle: 2019 Toyota Camry SE\nVIN: 4T1B11HK5KU123456\nMessage: Is this still available?",
    html: "",
  });
  assert.ok(lead);
  assert.equal(lead.provider, "Carfax");
  assert.equal(lead.name, "Sam Rivera");
  assert.equal(lead.phone?.replace(/\D/g, ""), "2145550182");
  assert.equal(lead.vin, "4T1B11HK5KU123456");
});

test("a Carfax email with nobody in it is not a lead", () => {
  assert.equal(parseLead({ from: "news@carfax.com", subject: "Tips for used car shoppers", text: "Read our latest guide.", html: "" }), null);
});
