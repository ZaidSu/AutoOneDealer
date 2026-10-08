import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyReadDue, inReadWindow, localClock } from "../../src/lib/inventory/schedule.ts";

const TZ = "America/Chicago";
// Oct 8, 2026 is in daylight time (UTC-5): 7:05 pm there is 00:05 UTC on Oct 9.
const at = (iso: string) => Date.parse(iso);

test("local clock uses the dealership's time zone", () => {
  assert.deepEqual(localClock(at("2026-10-09T00:05:00Z"), TZ), { hour: 19, day: "2026-10-08" });
  assert.deepEqual(localClock(at("2026-10-08T21:00:00Z"), TZ), { hour: 16, day: "2026-10-08" });
});
test("the read is due only in the 7 pm hour", () => {
  assert.equal(dailyReadDue(at("2026-10-09T00:05:00Z"), TZ, null), true);
  assert.equal(dailyReadDue(at("2026-10-09T00:55:00Z"), TZ, "2026-10-07"), true);
  assert.equal(dailyReadDue(at("2026-10-08T23:55:00Z"), TZ, null), false); // 6:55 pm
  assert.equal(dailyReadDue(at("2026-10-09T01:00:00Z"), TZ, null), false); // 8:00 pm
});
test("once today's read succeeded it is not due again until tomorrow", () => {
  assert.equal(dailyReadDue(at("2026-10-09T00:35:00Z"), TZ, "2026-10-08"), false);
  assert.equal(dailyReadDue(at("2026-10-10T00:05:00Z"), TZ, "2026-10-08"), true);
});
test("winter time (UTC-6) still means 7 pm local", () => {
  assert.equal(inReadWindow(at("2026-12-10T01:10:00Z"), TZ), true);
  assert.equal(inReadWindow(at("2026-12-10T00:10:00Z"), TZ), false);
});
