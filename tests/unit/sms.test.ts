import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { toE164, validTwilioSignature } from "../../src/lib/sms/twilio.ts";

test("phone numbers become +1 format", () => {
  assert.equal(toE164("(469) 555-0111"), "+14695550111");
  assert.equal(toE164("+1 469-555-0111"), "+14695550111");
  assert.equal(toE164("555-0111"), null);
});

test("only Twilio's signature is accepted", () => {
  const url = "https://auto-one-dealer.vercel.app/api/sms/incoming";
  const params = { From: "+14695550111", Body: "Is the Camry available?", MessageSid: "SM1" };
  const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
  const sig = createHmac("sha1", "tok").update(data).digest("base64");
  assert.equal(validTwilioSignature(url, params, sig, "tok"), true);
  assert.equal(validTwilioSignature(url, { ...params, Body: "changed" }, sig, "tok"), false);
  assert.equal(validTwilioSignature(url, params, sig, "other"), false);
  assert.equal(validTwilioSignature(url, params, null, "tok"), false);
});

import { firstTextBody } from "../../src/lib/sms/first-text.ts";
test("first text: no business name when the customer texted first, name when we start, nothing added after that", () => {
  const o = { dealerName: "Auto One Motors", sentBefore: false, theyTextedFirst: true };
  assert.equal(firstTextBody("Yes, it is available.", o), "Yes, it is available. Reply STOP to opt out.");
  assert.equal(firstTextBody("Hi Sam, thanks for your inquiry.", { ...o, theyTextedFirst: false }), "Auto One Motors: Hi Sam, thanks for your inquiry. Reply STOP to opt out.");
  assert.equal(firstTextBody("Auto One Motors: hello. Reply STOP to opt out.", { ...o, theyTextedFirst: false }), "Auto One Motors: hello. Reply STOP to opt out.");
  assert.equal(firstTextBody("Sounds good.", { ...o, sentBefore: true }), "Sounds good.");
});
