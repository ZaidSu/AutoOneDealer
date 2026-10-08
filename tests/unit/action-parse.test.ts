import test from "node:test";
import assert from "node:assert/strict";
import { parseActions } from "../../src/lib/ai/action-parse.ts";

const today = "2026-10-08", last = "2026-11-22";
test("a clear booking and rep request are read", () => {
  const a = parseActions('Sure: {"booking": {"date": "2026-10-10", "time": "14:00", "vehicle": "2019 Camry"}, "wantsRep": {"reason": "wants to talk price"}}', today, last);
  assert.deepEqual(a.booking, { date: "2026-10-10", time: "14:00", vehicle: "2019 Camry" });
  assert.equal(a.wantsRep?.reason, "wants to talk price");
});
test("vague, past, far-off or malformed bookings are ignored", () => {
  assert.equal(parseActions('{"booking": {"date": "2026-10-01", "time": "14:00"}, "wantsRep": null}', today, last).booking, null, "in the past");
  assert.equal(parseActions('{"booking": {"date": "2027-03-01", "time": "14:00"}}', today, last).booking, null, "too far away");
  assert.equal(parseActions('{"booking": {"date": "2026-10-10", "time": "2pm"}}', today, last).booking, null, "bad time");
  assert.equal(parseActions('{"booking": null, "wantsRep": null}', today, last).booking, null);
  assert.deepEqual(parseActions("no json here", today, last), { booking: null, wantsRep: null });
  assert.deepEqual(parseActions("{broken", today, last), { booking: null, wantsRep: null });
});
