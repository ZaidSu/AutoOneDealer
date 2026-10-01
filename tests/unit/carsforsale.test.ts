import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyCfs, parseFinanceApplication, parseWebsiteLead } from "../../src/lib/parsers/carsforsale.ts";
import { htmlToLines } from "../../src/lib/parsers/html.ts";

const finance = readFileSync(new URL("../fixtures/cfs-finance.html", import.meta.url), "utf8");
const lead = readFileSync(new URL("../fixtures/cfs-lead.html", import.meta.url), "utf8");

test("classifies CarsForSale emails by sender and subject", () => {
  assert.equal(classifyCfs("comm+abc@carsforsalemail.com", "New Loan App Submitted – Carsforsale.com"), "finance_application");
  assert.equal(classifyCfs("comm+abc@carsforsalemail.com", "New Lead – Carsforsale.com"), "website_lead");
  assert.equal(classifyCfs("no-reply@carsforsalemail.com", "Carsforsale.com - Login Activity"), "other");
  assert.equal(classifyCfs("someone@gmail.com", "New Loan App Submitted"), "other", "spoofed subjects from other senders are ignored");
});

test("parses a finance application", () => {
  assert.deepEqual(parseFinanceApplication(finance), {
    name: "Jane Testcase",
    phone: "4695550100",
    email: null,
    location: "Garland, TX",
    applicationId: "11880000",
    loanAmount: 24245,
    downPayment: 1500,
    source: "secure.carsforsale.com",
    viewUrl: "http://reply.example.com/view?a=1&b=2",
    vehicle: null,
    stock: null,
  });
});

test("parses a website lead", () => {
  const parsed = parseWebsiteLead(lead);
  assert.equal(parsed.name, "JOHN SAMPLE");
  assert.equal(parsed.phone, "4695550199");
  assert.equal(parsed.email, "john@example.com");
  assert.equal(parsed.source, "autoonemotorstx.com");
  assert.equal(parsed.comments, "Is the 2019 Camry still available? I'd like to see it Saturday.");
  assert.equal(parsed.replyUrl, "http://reply.example.com/reply?x=1");
});

test("missing fields stay empty instead of being guessed", () => {
  const parsed = parseFinanceApplication("<p>You have a NEW Finance Application!</p><p>Loan Amount: n/a</p>");
  assert.equal(parsed.name, null);
  assert.equal(parsed.phone, null);
  assert.equal(parsed.loanAmount, null);
  assert.equal(parsed.applicationId, null);
});

test("html is reduced to text without styles or scripts", () => {
  assert.deepEqual(htmlToLines("<style>x{}</style><script>alert(1)</script><p>Hi &amp; bye</p>"), ["Hi & bye"]);
});

const financeWithVehicle = readFileSync(new URL("../fixtures/cfs-finance-vehicle.html", import.meta.url), "utf8");
test("finance application with a Vehicle Information block still finds the applicant's name", () => {
  const app = parseFinanceApplication(financeWithVehicle);
  assert.equal(app.name, "Sam Samplename");
  assert.equal(app.phone, "2145550123");
  assert.equal(app.location, "Lewisville, TX");
  assert.equal(app.applicationId, "11890000");
  assert.equal(app.loanAmount, 23000);
  assert.equal(app.downPayment, 0);
  assert.equal(app.vehicle, "2022 Dodge Charger");
  assert.equal(app.stock, null); // the email leaves Stock # blank
});

const leadWithVehicle = readFileSync(new URL("../fixtures/cfs-lead-vehicle.html", import.meta.url), "utf8");
test("website lead reads the car from its Vehicle Information block", () => {
  const web = parseWebsiteLead(leadWithVehicle);
  assert.equal(web.vehicle, "2017 Toyota Corolla");
  assert.equal(web.stock, null);
  assert.equal(web.name, "Pat Example");
  assert.equal(web.phone, "2145550188");
  assert.equal(web.comments, "Hi. Is this still available? Interested in coming to take a look at it.");
});
