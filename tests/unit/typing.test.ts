import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TYPING_MS, cleanTypingSpeed, typingDelayMs } from "../../src/lib/ai/typing.ts";

const text = "Hey Sam, yes that Camry is still here! It's $16,500 with 81k miles. Want to come by today around 5?";

test("instant sends right away", () => assert.equal(typingDelayMs(text, "instant"), 0));
test("slower speeds wait longer, and longer texts take longer", () => {
  const mid = () => 0.5;
  const [fast, natural, slow] = (["fast", "natural", "slow"] as const).map((s) => typingDelayMs(text, s, mid));
  assert.ok(fast > 0 && fast < natural && natural < slow);
  assert.ok(typingDelayMs(text, "natural", mid) > typingDelayMs("Yes it is!", "natural", mid));
});
test("the wait never passes the limit", () => assert.equal(typingDelayMs("x".repeat(600), "slow", () => 1), MAX_TYPING_MS));
test("an unknown or missing setting means natural", () => {
  assert.equal(cleanTypingSpeed(undefined), "natural");
  assert.equal(cleanTypingSpeed("turbo"), "natural");
});
