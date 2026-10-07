import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leadKind, parseLead, providerFor } from "../../src/lib/parsers/leads.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

test("subject rules: Loan App = credit application, Lead = lead, replies ignored", () => {
  assert.equal(leadKind("New Loan App Submitted – Carsforsale.com"), "application");
  assert.equal(leadKind("Loan App"), "application");
  assert.equal(leadKind("Cars.com Phone Lead Notice for Auto One Motors - 2014 Cadillac Cts"), "inquiry");
  assert.equal(leadKind("Used lead from Edmunds DealerDirect"), "inquiry");
  assert.equal(leadKind("Re: Cars.com Lead"), null);
  assert.equal(leadKind("Leadership newsletter"), null);
  assert.equal(leadKind("Your statement is ready"), null);
});

test("provider names", () => {
  assert.equal(providerFor("salesleads@cars.com"), "Cars.com");
  assert.equal(providerFor("dealerdirect@edmunds.com"), "Edmunds");
  assert.equal(providerFor("comm+x@carsforsalemail.com"), "CarsForSale");
  assert.equal(providerFor("leads@mail.somesite.com"), "somesite.com");
});

test("Cars.com phone lead", () => {
  const lead = parseLead({
    from: "salesleads@cars.com",
    subject: "Cars.com Phone Lead Notice for Auto One Motors - 2014 Cadillac Cts",
    text: fixture("carscom-phone.txt"),
    html: "",
    mailbox: "txautoone@gmail.com",
  })!;
  assert.equal(lead.provider, "Cars.com");
  assert.equal(lead.type, "Phone call");
  assert.equal(lead.name, "TEST CUSTOMER");
  assert.equal(lead.phone, "2145550123");
  assert.equal(lead.location, "ADDISON, TX");
  assert.equal(lead.vehicle, "2014 Cadillac CTS");
  assert.equal(lead.vin, "1G6AR5SX0E0000000");
  assert.equal(lead.stock, "95500000");
  assert.equal(lead.email, null, "the dealership's own address is never taken as the customer's");
});

test("Edmunds ADF lead", () => {
  const lead = parseLead({ from: "dealerdirect@edmunds.com", subject: "Used lead from Edmunds DealerDirect", text: fixture("edmunds-adf.txt"), html: "" })!;
  assert.equal(lead.provider, "Edmunds");
  assert.equal(lead.type, "Contact Us");
  assert.equal(lead.name, "Sample Person");
  assert.equal(lead.phone, "3185550142");
  assert.equal(lead.email, "sample.person@example.com");
  assert.equal(lead.location, "Pineville, LA");
  assert.equal(lead.vehicle, "2024 Lexus IS");
  assert.equal(lead.comments, "Customer is requesting pricing for the vehicle below.");
});

test("ADF escaped inside HTML is still read", () => {
  const escaped = fixture("edmunds-adf.txt").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lead = parseLead({ from: "x@cargurus.com", subject: "New lead", text: "", html: `<div>${escaped}</div>` })!;
  assert.equal(lead.provider, "CarGurus");
  assert.equal(lead.name, "Sample Person");
});

test("CarsForSale credit application through the unified parser", () => {
  const lead = parseLead({ from: "comm+x@carsforsalemail.com", subject: "New Loan App Submitted – Carsforsale.com", text: "", html: fixture("cfs-finance.html") })!;
  assert.equal(lead.kind, "application");
  assert.equal(lead.type, "Credit application");
  assert.equal(lead.name, "Jane Testcase");
  assert.equal(lead.loanAmount, 24245);
});

test("unknown layouts fall back to finding a phone and email in the text", () => {
  const lead = parseLead({
    from: "notify@newsite.com",
    subject: "New Lead: 2019 Toyota Camry",
    text: "Someone is interested.\nName: Pat Example\nCall them at (972) 555-0177 or pat@example.com",
    html: "",
  })!;
  assert.equal(lead.name, "Pat Example");
  assert.equal(lead.phone, "9725550177");
  assert.equal(lead.email, "pat@example.com");
  assert.equal(lead.vehicle, "2019 Toyota Camry");
});

test("Westlake pre-qualification", () => {
  const text = readFileSync(new URL("../fixtures/westlake-prequal.txt", import.meta.url), "utf8");
  const lead = parseLead({ from: "noreply@westlakefinancial.com", subject: "Westlake: New Pre-Qualification Received for 2015 NISSAN MURANO", text, html: "", mailbox: "txautoone@gmail.com" })!;
  assert.equal(lead.kind, "application");
  assert.equal(lead.type, "Pre-qualification");
  assert.equal(lead.provider, "Westlake Financial");
  assert.equal(lead.name, "Randy Briggs");
  assert.equal(lead.email, "randy_briggs2000@yahoo.com");
  assert.equal(lead.phone, "8046831578");
  assert.equal(lead.vehicle, "2015 NISSAN MURANO");
  assert.equal(lead.loanAmount, 8538);
  assert.equal(lead.downPayment, 3500);
  assert.equal(lead.applicationId, "130427432");
  assert.match(lead.comments!, /\$235\/mo/);
  assert.match(lead.comments!, /Proof of Income/);
});

test("CarsForSale lead and loan application both carry the car", () => {
  const lead = parseLead({ from: "comm+x@carsforsalemail.com", subject: "New Lead – 2017 Toyota Corolla – Carsforsale.com", text: "", html: fixture("cfs-lead-vehicle.html") })!;
  assert.equal(lead.vehicle, "2017 Toyota Corolla");
  assert.equal(lead.name, "Pat Example");
  const app = parseLead({ from: "comm+x@carsforsalemail.com", subject: "New Loan App Submitted – Carsforsale.com", text: "", html: fixture("cfs-finance-vehicle.html") })!;
  assert.equal(app.kind, "application");
  assert.equal(app.name, "Sam Samplename");
  assert.equal(app.vehicle, "2022 Dodge Charger");
});

test("the car falls back to the subject line when the email has no vehicle block", () => {
  const lead = parseLead({ from: "comm+x@carsforsalemail.com", subject: "New Lead – 2014 Cadillac CTS – Carsforsale.com", text: "", html: fixture("cfs-lead.html") })!;
  assert.equal(lead.vehicle, "2014 Cadillac CTS");
});

test("OfferUp buyer message becomes a lead whose email is OfferUp's private reply address", () => {
  const from = "Zaid (OfferUp) <reply-808138aa128c439e98de0c21edd0fc47@messages.offerup.com>";
  const lead = parseLead({ from, subject: "Re: 2015 Nissan Murano", text: fixture("offerup-message.txt"), html: "" })!;
  assert.equal(lead.kind, "inquiry");
  assert.equal(lead.provider, "OfferUp");
  assert.equal(lead.type, "OfferUp message");
  assert.equal(lead.name, "Zaid");
  assert.equal(lead.email, "reply-808138aa128c439e98de0c21edd0fc47@messages.offerup.com");
  assert.equal(lead.vehicle, "2015 Nissan Murano");
  assert.equal(lead.comments, "Hello");
  assert.equal(lead.phone, null);
  assert.equal(lead.location, null, "the town printed under the car is the dealership's, not the buyer's");
});

test("OfferUp: a message of several lines, an HTML-only email, and promotions that are not messages", () => {
  const from = "Maria G (OfferUp) <reply-abc123@messages.offerup.com>";
  const multi = parseLead({ from, subject: "Re: 2019 Honda Civic", text: "Maria G:\n“Is this still available?\nCan I come today?”\n2019 Honda Civic\t2019 Honda Civic\nDallas, TX - $14,500.00", html: "" })!;
  assert.equal(multi.comments, "Is this still available?\nCan I come today?");
  const html = parseLead({ from, subject: "Re: 2019 Honda Civic", text: "", html: "<div>Respond to Maria G by simply replying to this email.</div><p>Maria G:</p><p>&ldquo;What&#39;s your best price?&rdquo;</p><p>2019 Honda Civic</p>" })!;
  assert.equal(html.comments, "What's your best price?");
  assert.equal(parseLead({ from: "OfferUp <noreply@offerup.com>", subject: "Re: your listing", text: "Promote your listing", html: "" }), null);
  assert.equal(parseLead({ from: "OfferUp <reply-abc123@messages.offerup.com>", subject: "Re: 2019 Honda Civic", text: "nothing quoted here", html: "" }), null);
});
