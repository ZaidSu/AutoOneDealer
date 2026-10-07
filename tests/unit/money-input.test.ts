import assert from "node:assert/strict";
import { test } from "node:test";
import { chargeOk, cleanLabel, monthlyOk, parseDollars } from "../../src/lib/billing/money-input.ts";

test("typed amounts become cents, and junk is refused", () => {
  assert.equal(parseDollars("379"), 37900);
  assert.equal(parseDollars("$1,234.50"), 123450);
  assert.equal(parseDollars("11.5"), 1150);
  assert.equal(parseDollars("-20"), -2000);
  for (const bad of ["", "abc", "1.234", "12 dollars", "1e3", null, undefined]) assert.equal(parseDollars(bad), null, String(bad));
});

test("limits: monthly price $1 to $10,000; charges never zero and within $10,000 either way", () => {
  assert.equal(monthlyOk(37900), true);
  assert.equal(monthlyOk(50), false);
  assert.equal(monthlyOk(1_000_100), false);
  assert.equal(monthlyOk(null), false);
  assert.equal(chargeOk(9900), true);
  assert.equal(chargeOk(-2000), true);
  assert.equal(chargeOk(0), false);
  assert.equal(chargeOk(2_000_000), false);
});

test("labels are tidied and capped", () => {
  assert.equal(cleanLabel("  Setup   fee \n"), "Setup fee");
  assert.equal(cleanLabel("x".repeat(300)).length, 120);
});
