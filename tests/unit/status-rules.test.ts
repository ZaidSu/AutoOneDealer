import assert from "node:assert/strict";
import { test } from "node:test";
import { CONVERSATION_RULES, DEPOSIT_RULES, isNoReply } from "../../src/lib/ai/status-rules.ts";
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
