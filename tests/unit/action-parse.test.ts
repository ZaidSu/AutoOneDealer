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

import { repAlertText } from "../../src/lib/ai/action-parse.ts";
test("the reason and a summary are read", () => {
  const a = parseActions('{"booking": null, "wantsRep": {"reason": "Carfax for the Camry", "summary": "Asked for a Carfax; the AI said a salesperson will send it."}}', today, last);
  assert.equal(a.wantsRep?.reason, "Carfax for the Camry");
  assert.match(a.wantsRep?.summary ?? "", /salesperson/);
  assert.equal(parseActions('{"wantsRep": {"reason": "call me"}}', today, last).wantsRep?.summary, "");
});
test("the alert text has the name, phone, car, what they want and what was said, and keeps the link whole", () => {
  const link = "https://x.test/customers/abc";
  const t = repAlertText({ who: "Sam Lee", phone: "4695550111", car: "2019 Toyota Camry", reason: "Carfax report", summary: "Asked for the Carfax. AI said a salesperson will send it.", link });
  assert.match(t, /Sam Lee \(469-555-0111\)/);
  assert.match(t, /2019 Toyota Camry/);
  assert.match(t, /Wants: Carfax report\./);
  assert.match(t, /Talked about: Asked for the Carfax/);
  assert.ok(t.endsWith(link));
  const long = repAlertText({ who: "Sam", phone: null, car: null, reason: "x", summary: "y".repeat(900), link });
  assert.ok(long.length <= 462 && long.endsWith(link) && long.includes("…"));
});
