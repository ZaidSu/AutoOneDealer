import assert from "node:assert/strict";
import { test } from "node:test";
import { closedNote, openStatus, statusLine, type DayHours } from "../../src/lib/ai/open-now.ts";

const nineToSeven: DayHours[] = Array.from({ length: 7 }, (_, i) => ({ open: "09:00", close: "19:00", closed: i === 6 }));
const TZ = "America/Chicago";
// October 2026 is daylight time in Dallas (UTC-5).
const at = (iso: string) => new Date(`${iso}-05:00`);

test("open during the day", () => {
  const s = openStatus(nineToSeven, at("2026-10-14T10:00:00"), TZ); // Wednesday
  assert.equal(s.open, true);
  assert.equal(s.when, "7 PM");
  assert.equal(closedNote(s), "");
});
test("closed at night: opens tomorrow at 9 AM", () => {
  const s = openStatus(nineToSeven, at("2026-10-13T21:51:00"), TZ); // Tuesday 9:51 PM
  assert.deepEqual(s, { open: false, when: "tomorrow at 9 AM" });
  assert.match(closedNote(s, "469-888-0803"), /CLOSED RIGHT NOW/);
  assert.match(statusLine(s), /CLOSED \(opens tomorrow at 9 AM\)/);
});
test("before opening the same morning", () => {
  assert.deepEqual(openStatus(nineToSeven, at("2026-10-14T07:30:00"), TZ), { open: false, when: "today at 9 AM" });
});
test("Saturday night skips closed Sunday to Monday", () => {
  assert.deepEqual(openStatus(nineToSeven, at("2026-10-17T20:00:00"), TZ), { open: false, when: "Monday at 9 AM" });
});
test("exactly at closing time is closed, exactly at opening is open", () => {
  assert.equal(openStatus(nineToSeven, at("2026-10-14T19:00:00"), TZ).open, false);
  assert.equal(openStatus(nineToSeven, at("2026-10-14T09:00:00"), TZ).open, true);
});
test("no hours on file: treated as open", () => {
  assert.equal(openStatus(undefined, new Date(), TZ).open, true);
});

import { renderFollowupMessage } from "../../src/lib/sms/followup-rules.ts";
test("follow-up message fills in the name and car, with fallbacks", () => {
  const v = { firstName: "Sam", car: "2019 Honda Civic", dealership: "Auto One Motors" };
  assert.equal(renderFollowupMessage("Hi {first_name}, how's your {car}? - {dealership}", v), "Hi Sam, how's your 2019 Honda Civic? - Auto One Motors");
  assert.equal(renderFollowupMessage("Hi {first_name}, how's your {car}?", { ...v, firstName: null, car: null }), "Hi there, how's your car?");
  assert.equal(renderFollowupMessage("Hi {nope}  there", v), "Hi there");
});
