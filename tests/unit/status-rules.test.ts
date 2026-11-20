import assert from "node:assert/strict";
import { test } from "node:test";
import { CONVERSATION_RULES, DEPOSIT_RULES, askedAQuestion, cleanShippingRate, isAcknowledgment, isNoReply, riskyPromise, shippingRule, staySilentAfter } from "../../src/lib/ai/status-rules.ts";
import { describeListing, formatLot, type Listing } from "../../src/lib/inventory/match.ts";

const car = (over: Partial<Listing> = {}): Listing => ({ id: "1", financeId: null, url: "https://x.test/1", year: 2027, slug: "kia-telluride", title: "2027 Kia Telluride S", price: 31995, mileage: 2226, sold: false, ...over });

test("NO_REPLY is recognised however the AI punctuates it", () => {
  for (const t of ["NO_REPLY", "no_reply", " NO REPLY. ", "\"NO_REPLY\""]) assert.equal(isNoReply(t), true, t);
  for (const t of ["", "Sounds good, see you Tuesday", "No reply needed? Let me know!"]) assert.equal(isNoReply(t), false, t);
});

test("a car with a deposit is described as spoken for", () => {
  assert.match(describeListing(car({ deposit: true })), /DEPOSIT TAKEN/);
  assert.doesNotMatch(describeListing(car()), /DEPOSIT/);
  const lot = formatLot([car({ deposit: true }), car({ id: "2", title: "2025 Kia Sorento" })], { complete: true, minutesAgo: 5 });
  assert.match(lot, /Telluride S.*DEPOSIT TAKEN/);
  assert.match(lot, /unless it says DEPOSIT TAKEN/);
});

test("the shared rules cover the deposit and goodbye cases", () => {
  assert.match(DEPOSIT_RULES, /Yes, that one has a deposit on it/);
  assert.match(DEPOSIT_RULES, /believe them/);
  assert.match(CONVERSATION_RULES, /NO_REPLY/);
  assert.match(CONVERSATION_RULES, /bad review/);
});

test("short okays and thank-yous are acknowledgments", () => {
  for (const t of ["Okay", "Ok", "okay 👍", "Okay.", "Thank you that will help", "Thanks!", "thx", "👍", "Sounds good", "Got it, thanks", "Perfect", "ok thank you so much"]) assert.equal(isAcknowledgment(t), true, t);
});
test("real answers and questions are not acknowledgments", () => {
  for (const t of ["Yes", "No", "Ok but what about the price?", "Okay can I come at 5", "Pass thanks.", "Guess it was never approved never Hurd back", "Text pls", "Clean title?", "Thank you Rodney, see you at 2"]) assert.equal(isAcknowledgment(t), false, t);
});
test("a short okay after a question is an answer, after a statement it needs no reply", () => {
  assert.equal(askedAQuestion("Mario can give you a quick call right now, want me to have him call you?"), true);
  assert.equal(askedAQuestion("The 2025 Civic is available at $21,995. When could you come see it? Reply STOP to opt out."), true);
  assert.equal(askedAQuestion("I'm sorry for the frustration, Rodney. A manager will call you shortly to go over your options."), false);
  assert.equal(staySilentAfter("Okay", "Still trying for an approval w other lenders.Mario"), true);
  assert.equal(staySilentAfter("Okay 👍", "A manager will call you shortly."), true);
  assert.equal(staySilentAfter("Okay", "Want me to have him call you?"), false);
  assert.equal(staySilentAfter("Okay", null), false);
});
test("the shared rules cover the title question and staying by text", () => {
  assert.match(DEPOSIT_RULES, /TITLE:/);
  assert.match(DEPOSIT_RULES, /BY TEXT:/);
  assert.match(CONVERSATION_RULES, /SHORT "OKAY"/);
});

test("shipping rate: $1.50 a mile by default, cleaned when typed", () => {
  assert.equal(cleanShippingRate(undefined), 1.5);
  assert.equal(cleanShippingRate(""), 1.5);
  assert.equal(cleanShippingRate("$1.75"), 1.75);
  assert.equal(cleanShippingRate("0"), 1.5);
  assert.equal(cleanShippingRate("999"), 20);
  assert.match(shippingRule(), /\$1\.50 per mile/);
  assert.match(shippingRule(2), /\$2\.00 per mile/);
  assert.match(shippingRule(), /a bit more or a bit less/);
  assert.match(shippingRule(), /never ask for a street address/);
});

test("a reply that promises what only a person can is held back, a normal answer is not", () => {
  for (const t of ["Yes, for sure! I'll hold it for you for 3 months.", "We'll save it for you, no problem.", "Consider it reserved.", "Good news, you're approved!", "Financing is guaranteed.", "It's accident-free and has a clean title.", "We'll take $18,000 for it."]) assert.ok(riskyPromise(t), t);
  for (const t of ["A car can be held with a deposit, around $500, for 1 to 2 weeks. A sales rep can set that up.", "A rep will see if you're approved.", "I can't confirm the clean title, a team member will text you.", "Yes, the 2025 Civic is available at $21,995 with 3,715 miles.", "We can't hold a car that long, but a sales rep can go over options."]) assert.equal(riskyPromise(t), null, t);
});
test("the shared rules say how to handle hold requests and private info", () => {
  assert.match(DEPOSIT_RULES, /HOLDS:/);
  assert.match(DEPOSIT_RULES, /around \$500, for 1 to 2 weeks/);
  assert.match(DEPOSIT_RULES, /PRIVATE INFO:/);
});
