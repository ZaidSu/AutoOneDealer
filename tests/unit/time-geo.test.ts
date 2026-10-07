import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayKey, zonedToUtc } from "../../src/lib/utils/time.ts";
import { scopeFor, stateFromLocation } from "../../src/lib/utils/geo.ts";

const TZ = "America/Chicago";

test("dealership time converts correctly across daylight saving", () => {
  assert.equal(zonedToUtc("2026-09-28", "11:00", TZ)!.toISOString(), "2026-09-28T16:00:00.000Z"); // CDT, UTC-5
  assert.equal(zonedToUtc("2026-12-01", "11:00", TZ)!.toISOString(), "2026-12-01T17:00:00.000Z"); // CST, UTC-6
  assert.equal(zonedToUtc("bad", "11:00", TZ), null);
});

test("day keys follow the dealership's calendar, not UTC", () => {
  // 11:30 PM in Dallas is already the next day in UTC.
  assert.equal(dayKey(zonedToUtc("2026-09-28", "23:30", TZ)!, TZ), "2026-09-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("in state / out of state", () => {
  assert.equal(stateFromLocation("Pineville, LA"), "LA");
  assert.equal(stateFromLocation("ADDISON, TX"), "TX");
  assert.equal(stateFromLocation("Garland,  tx 75040"), "TX");
  assert.equal(stateFromLocation("456456, XX"), null, "unknown codes aren't guessed");
  assert.equal(stateFromLocation(null), null);
  assert.equal(scopeFor("TX"), "in");
  assert.equal(scopeFor("OK"), "out");
  assert.equal(scopeFor(null), null);
});
