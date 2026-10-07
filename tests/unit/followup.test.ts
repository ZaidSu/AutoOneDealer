import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanDays, followupState } from "../../src/lib/sms/followup-rules.ts";

const base = { status: "purchased", purchasedAt: new Date("2026-10-01T15:00:00Z"), followupAt: null, off: false, phone: "4695550111" };
const at = (iso: string) => new Date(iso);

test("a follow-up is scheduled for a week after the purchase, then due", () => {
  assert.equal(followupState(base, 7, at("2026-10-05T15:00:00Z")).state, "scheduled");
  assert.equal(followupState(base, 7, at("2026-10-08T15:00:00Z")).state, "due");
  assert.equal(followupState(base, 7, at("2026-10-20T15:00:00Z")).state, "due");
});

test("it is skipped once it's too late, so old purchases aren't all texted at once", () => {
  assert.equal(followupState(base, 7, at("2026-11-10T15:00:00Z")).state, "too_late");
});

test("each customer gets one, and off / no phone / not purchased never send", () => {
  const late = at("2026-10-10T15:00:00Z");
  assert.equal(followupState({ ...base, followupAt: late }, 7, late).state, "sent");
  assert.equal(followupState({ ...base, off: true }, 7, late).state, "off");
  assert.equal(followupState({ ...base, phone: null }, 7, late).state, "no_phone");
  assert.equal(followupState({ ...base, status: "new" }, 7, late).state, "not_purchased");
});

test("days are kept sensible", () => {
  assert.equal(cleanDays("10"), 10);
  assert.equal(cleanDays(0), 7);
  assert.equal(cleanDays("abc"), 7);
  assert.equal(cleanDays(500), 7);
});
