import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCopy, cleanStage, cleanWeeks, matches, nextReminderAt, reminderDue, reminderText } from "../../src/lib/registration/rules.ts";

const DAY = 86_400_000;
const bought = Date.UTC(2026, 9, 1);

test("stages, copies and weeks are cleaned", () => {
  assert.equal(cleanStage("pickup"), "pickup"); assert.equal(cleanStage("nope"), null);
  assert.equal(cleanCopy("made"), "made"); assert.equal(cleanCopy(""), null);
  assert.equal(cleanWeeks(4), 4); assert.equal(cleanWeeks(0), 3); assert.equal(cleanWeeks("x"), 3); assert.equal(cleanWeeks(12), 3);
});

test("the manager is reminded at the set week, once more a week later, then never again", () => {
  const w = 3;
  assert.equal(reminderDue({ purchasedAt: bought, weeks: w, sent: 0, lastAt: null, now: bought + 20 * DAY }), false);
  assert.equal(reminderDue({ purchasedAt: bought, weeks: w, sent: 0, lastAt: null, now: bought + 21 * DAY }), true);
  const first = bought + 22 * DAY;
  assert.equal(reminderDue({ purchasedAt: bought, weeks: w, sent: 1, lastAt: first, now: first + 6 * DAY }), false);
  assert.equal(reminderDue({ purchasedAt: bought, weeks: w, sent: 1, lastAt: first, now: first + 7 * DAY }), true);
  assert.equal(reminderDue({ purchasedAt: bought, weeks: w, sent: 2, lastAt: first, now: first + 30 * DAY }), false);
});

test("an old sale does not trigger reminders when the feature is switched on", () => {
  assert.equal(reminderDue({ purchasedAt: bought, weeks: 3, sent: 0, lastAt: null, now: bought + (21 + 57) * DAY }), false);
});

test("next reminder date", () => {
  assert.equal(nextReminderAt({ purchasedAt: bought, weeks: 3, sent: 0, lastAt: null }), bought + 21 * DAY);
  assert.equal(nextReminderAt({ purchasedAt: bought, weeks: 3, sent: 1, lastAt: bought + 22 * DAY }), bought + 29 * DAY);
  assert.equal(nextReminderAt({ purchasedAt: bought, weeks: 3, sent: 2, lastAt: bought + 29 * DAY }), null);
});

test("reminder text names the customer and the car", () => {
  const t = reminderText({ name: "John Smith", car: "2019 Toyota Camry", boughtOn: "Oct 1", link: "https://x.test/registration", second: false });
  assert.match(t, /John Smith/); assert.match(t, /2019 Toyota Camry/); assert.match(t, /https:\/\/x\.test\/registration/);
  assert.match(reminderText({ name: null, car: null, boughtOn: "Oct 1", link: "l", second: true }), /Reminder: .*a customer, their car/);
});

test("filters", () => {
  const r = (stage: "waiting" | "pickup" | "picked" | "done", copy: "needed" | "made" | "none", deferred = false) => ({ stage, copy, deferred });
  assert.equal(matches(r("waiting", "needed"), "copy"), false);   // not here yet, so no copy to make
  assert.equal(matches(r("pickup", "needed"), "copy"), true);
  assert.equal(matches(r("done", "needed"), "open"), false);
  assert.equal(matches(r("picked", "made", true), "deferred"), true);
  assert.equal(matches(r("done", "made", true), "deferred"), false);
  assert.equal(matches(r("done", "made"), "done"), true);
  assert.equal(matches(r("done", "made"), "all"), true);
});
