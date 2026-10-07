import assert from "node:assert/strict";
import { test } from "node:test";
import { ago, bucket, isKeywordOnly, mergeRows, reasonOfKey, snippet, stateKey, WEIGHT, wantsToBuy, type TodoReason } from "../../src/lib/crm/todo-rules.ts";

const r = (reason: TodoReason["reason"], weight: number, since: number, token = "t"): TodoReason => ({ reason, label: reason, detail: reason, since, token, weight });

test("one row per customer, with every reason, most urgent first", () => {
  const rows = mergeRows([
    { id: "p-1", customerKey: "p-1", name: "Ann", phone: null, vehicle: null, reason: r("new_lead", WEIGHT.newLead, 100) },
    { id: "p-1", customerKey: "p-1", name: "Ann", phone: "469", vehicle: "2019 Camry", reason: r("replied", WEIGHT.repliedHot, 200) },
    { id: "p-2", customerKey: "p-2", name: "Bo", phone: null, vehicle: null, reason: r("callback", WEIGHT.callback, 50) },
    { id: "p-3", customerKey: "p-3", name: "Cy", phone: null, vehicle: null, reason: r("callback", WEIGHT.callback, 10) },
  ]);
  assert.deepEqual(rows.map((x) => x.id), ["p-1", "p-3", "p-2"]); // hot reply first, then the longest-waiting reminder
  assert.deepEqual(rows[0].reasons.map((x) => x.reason), ["replied", "new_lead"]);
  assert.equal(rows[0].phone, "469"); // details are filled in from whichever reason had them
});

test("sections", () => {
  assert.equal(bucket(WEIGHT.repliedHot), "now");
  assert.equal(bucket(WEIGHT.callback), "now");
  assert.equal(bucket(WEIGHT.application), "today");
  assert.equal(bucket(WEIGHT.appointmentToday), "today");
  assert.equal(bucket(WEIGHT.appointmentTomorrow), "later");
});

test("ready-to-buy words and automatic keywords", () => {
  assert.equal(wantsToBuy("I will pay that deposit tomorrow"), true);
  assert.equal(wantsToBuy("Is it still available?"), true);
  assert.equal(wantsToBuy("thanks, ok"), false);
  assert.equal(isKeywordOnly("STOP"), true);
  assert.equal(isKeywordOnly("Unsubscribe"), true);
  assert.equal(isKeywordOnly("Please stop by Saturday"), false);
});

test("saved keys are checked, and customer keys with dashes and colons are fine", () => {
  const key = stateKey("e-abc_DEF-123", "replied", "1727800000000");
  assert.equal(reasonOfKey(key), "replied");
  assert.equal(reasonOfKey("x|nonsense|1"), null);
  assert.equal(reasonOfKey("a b|replied|1"), null);
});

test("time and text helpers", () => {
  const now = 1_000_000_000_000;
  assert.equal(ago(now - 30_000, now), "just now");
  assert.equal(ago(now - 25 * 60_000, now), "25 minutes ago");
  assert.equal(ago(now - 3 * 3600_000, now), "3 hours ago");
  assert.equal(ago(now - 50 * 3600_000, now), "2 days ago");
  assert.equal(snippet("a  b\n c", 50), "a b c");
  assert.ok(snippet("x".repeat(300), 20).length <= 20);
});
