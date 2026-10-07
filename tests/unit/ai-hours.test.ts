import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSchedule, DEFAULT_SCHEDULE, describeSchedule, nextOpening, scheduleProblem, withinSchedule } from "../../src/lib/ai/hours.ts";

const TZ = "America/Chicago";
// Oct 2026: CDT (UTC-5). Sunday Oct 4, Monday Oct 5.
const at = (iso: string) => new Date(iso);

test("the default: every day including Sunday, 9 AM to 8 PM Dallas time", () => {
  assert.deepEqual(DEFAULT_SCHEDULE.days, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(withinSchedule(DEFAULT_SCHEDULE, at("2026-10-04T15:00:00Z"), TZ), true, "Sunday 10 AM");
  assert.equal(withinSchedule(DEFAULT_SCHEDULE, at("2026-10-04T13:59:00Z"), TZ), false, "Sunday 8:59 AM");
  assert.equal(withinSchedule(DEFAULT_SCHEDULE, at("2026-10-04T14:00:00Z"), TZ), true, "9:00 AM is included");
  assert.equal(withinSchedule(DEFAULT_SCHEDULE, at("2026-10-05T00:59:00Z"), TZ), true, "7:59 PM");
  assert.equal(withinSchedule(DEFAULT_SCHEDULE, at("2026-10-05T01:00:00Z"), TZ), false, "8:00 PM is not included");
  assert.equal(withinSchedule(DEFAULT_SCHEDULE, at("2026-10-05T05:30:00Z"), TZ), false, "12:30 AM");
});

test("chosen days and hours are respected (no Sundays, 10 to 6)", () => {
  const s = { days: [1, 2, 3, 4, 5, 6], from: "10:00", to: "18:00" };
  assert.equal(withinSchedule(s, at("2026-10-04T19:00:00Z"), TZ), false, "Sunday 2 PM");
  assert.equal(withinSchedule(s, at("2026-10-05T19:00:00Z"), TZ), true, "Monday 2 PM");
  assert.equal(withinSchedule(s, at("2026-10-05T14:30:00Z"), TZ), false, "Monday 9:30 AM");
});

test("saving: bad input is refused with a reason, and cleaned input always works", () => {
  assert.equal(scheduleProblem({ days: [], from: "09:00", to: "20:00" }), "Pick at least one day.");
  assert.match(scheduleProblem({ days: [1], from: "20:00", to: "09:00" }) ?? "", /later than the start/);
  assert.equal(scheduleProblem({ days: [1, 7], from: "09:00", to: "20:00" }), null);
  assert.deepEqual(cleanSchedule(null), DEFAULT_SCHEDULE);
  assert.deepEqual(cleanSchedule({ days: [3, 1, 1, 9, "x"], from: "08:30", to: "07:00" }), { days: [1, 3], from: "08:30", to: "20:00" });
});

test("hours in words", () => {
  assert.equal(describeSchedule(DEFAULT_SCHEDULE), "every day, 9 AM to 8 PM");
  assert.equal(describeSchedule({ days: [1, 2, 3, 4, 5, 6], from: "09:00", to: "19:00" }), "Mon to Sat, 9 AM to 7 PM");
  assert.equal(describeSchedule({ days: [1, 3, 5], from: "10:30", to: "18:00" }), "Mon, Wed and Fri, 10:30 AM to 6 PM");
});

test("when waiting replies get written", () => {
  assert.equal(nextOpening(DEFAULT_SCHEDULE, at("2026-10-05T03:00:00Z"), TZ), "tomorrow at 9 AM", "10 PM Sunday night");
  assert.equal(nextOpening(DEFAULT_SCHEDULE, at("2026-10-05T11:00:00Z"), TZ), "today at 9 AM", "6 AM Monday");
  const weekdays = { days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" };
  assert.equal(nextOpening(weekdays, at("2026-10-04T20:00:00Z"), TZ), "tomorrow at 9 AM", "Sunday afternoon, weekdays only");
  assert.equal(nextOpening(weekdays, at("2026-10-10T20:00:00Z"), TZ), "Monday at 9 AM", "Saturday afternoon, weekdays only");
});
