import test from "node:test";
import assert from "node:assert/strict";
import { isOfferUp, textify } from "../../src/lib/ai/offerup-style.ts";

test("detects OfferUp by provider or relay address", () => {
  assert.equal(isOfferUp("OfferUp"), true);
  assert.equal(isOfferUp("CarGurus", "x@messages.offerup.com"), true);
  assert.equal(isOfferUp("CarGurus", "bob@gmail.com"), false);
});
test("textify strips email-style endings", () => {
  assert.equal(textify("Yes it's still here! Want to come by today?\n\nBest regards,\nThe team at Auto One Motors\n(555) 123-4567"), "Yes it's still here! Want to come by today?");
  assert.equal(textify("Sure, 3pm works."), "Sure, 3pm works.");
});
