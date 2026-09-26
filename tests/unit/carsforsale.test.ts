import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyCfs, parseFinanceApplication, parseWebsiteLead } from "../../lib/parsers/carsforsale.ts";
import { htmlToLines } from "../../lib/parsers/html.ts";

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
