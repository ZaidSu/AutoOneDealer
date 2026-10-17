import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarTable, clock12, resolveDay, shortDate, stamp, weekdayName, withinOpeningHours } from "../../src/lib/ai/calendar.ts";

// Thursday, October 15, 2026
const THU = "2026-10-15";
test("weekday names and the calendar are right", () => {
  assert.equal(weekdayName("2026-10-12"), "Monday");
  assert.equal(weekdayName(THU), "Thursday");
  assert.equal(shortDate("2026-10-20"), "Tue, Oct 20");
  const t = calendarTable(THU, 3).split("\n");
  assert.equal(t[0], "Thursday, Oct 15, 2026 = 2026-10-15 (TODAY)");
  assert.equal(t[1], "Friday, Oct 16, 2026 = 2026-10-16 (tomorrow)");
  assert.equal(t[2], "Saturday, Oct 17, 2026 = 2026-10-17");
});
test("a weekday means the next one", () => {
  assert.equal(resolveDay("tuesday", THU, "18:00", "10:30"), "2026-10-20");
  assert.equal(resolveDay("Tues", THU, "18:00", "10:30"), "2026-10-20");
  assert.equal(resolveDay("saturday", THU, "12:00", "10:30"), "2026-10-17");
  assert.equal(resolveDay("friday", THU, "12:00", "10:30"), "2026-10-16");
});
test("the same weekday: later today, or next week if the time has passed", () => {
  assert.equal(resolveDay("thursday", THU, "18:00", "10:30"), THU);
  assert.equal(resolveDay("thursday", THU, "09:00", "10:30"), "2026-10-22");
});
test("today, tomorrow and next <weekday>", () => {
  assert.equal(resolveDay("today", THU), THU);
  assert.equal(resolveDay("tonight", THU), THU);
  assert.equal(resolveDay("tomorrow", THU), "2026-10-16");
  assert.equal(resolveDay("day after tomorrow", THU), "2026-10-17");
  assert.equal(resolveDay("next tuesday", THU), "2026-10-20");
  assert.equal(resolveDay("next friday", THU), "2026-10-23", "Friday of the following week, not tomorrow");
  assert.equal(resolveDay("next tuesday", "2026-10-12"), "2026-10-20", "said on a Monday: the following week's Tuesday");
});
test("the example that went wrong: said on Saturday Oct 10, 'tuesday at 6pm' is Oct 13, not Oct 15", () => {
  assert.equal(resolveDay("tuesday", "2026-10-10", "18:00", "21:50"), "2026-10-13");
});
test("explicit dates pass through; nonsense is null", () => {
  assert.equal(resolveDay("2026-10-24", THU), "2026-10-24");
  assert.equal(resolveDay("sometime next week", THU), null);
  assert.equal(resolveDay("", THU), null);
});
test("opening hours check, Monday first", () => {
  const hours = Array.from({ length: 7 }, (_, i) => ({ open: "09:00", close: "19:00", closed: i === 6 }));
  assert.equal(withinOpeningHours(hours, "2026-10-20", "18:00"), true);
  assert.equal(withinOpeningHours(hours, "2026-10-20", "19:30"), false);
  assert.equal(withinOpeningHours(hours, "2026-10-18", "12:00"), false, "Sunday is closed");
  assert.equal(withinOpeningHours(undefined, "2026-10-18", "12:00"), true);
});
test("clock and message stamps", () => {
  assert.equal(clock12("18:00"), "6:00 PM");
  assert.equal(clock12("09:05"), "9:05 AM");
  assert.equal(stamp(Date.parse("2026-10-14T02:51:00Z"), "America/Chicago"), "Tue Oct 13, 9:51 PM");
});
