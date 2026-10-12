import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceView, nextDueDate } from "../../src/lib/billing/balance.ts";

test("next due date is the next 3rd, today included", () => {
  assert.equal(nextDueDate("2026-10-12", 3), "2026-11-03");
  assert.equal(nextDueDate("2026-11-03", 3), "2026-11-03");
  assert.equal(nextDueDate("2026-12-20", 3), "2027-01-03");
});
test("paid up shows $0 and the next due date (the one already paid is skipped)", () => {
  const v = balanceView([{ status: "paid", dueDate: "2026-11-03", total: 37900 }], "2026-10-12", 3, 37900);
  assert.deepEqual(v, { kind: "clear", amountCents: 0, nextDue: "2026-12-03" });
});
test("a bill more than 7 days away is still $0; at 7 days it shows as due", () => {
  const bill = { status: "open" as const, dueDate: "2026-11-03", total: 37900 };
  assert.equal(balanceView([bill], "2026-10-26", 3, null).kind, "clear");
  assert.deepEqual(balanceView([bill], "2026-10-27", 3, null), { kind: "due", amountCents: 37900, dueDate: "2026-11-03", daysLeft: 7, estimate: false });
  assert.equal(balanceView([bill], "2026-11-03", 3, null).kind, "due");
});
test("before the bill exists, an estimate shows 7 days before the due date", () => {
  assert.equal(balanceView([], "2026-10-26", 3, 37900).kind, "clear");
  assert.deepEqual(balanceView([], "2026-10-28", 3, 37900), { kind: "due", amountCents: 37900, dueDate: "2026-11-03", daysLeft: 6, estimate: true });
});
test("past due and processing", () => {
  assert.deepEqual(balanceView([{ status: "open", dueDate: "2026-11-03", total: 100 }], "2026-11-06", 3, null), { kind: "past_due", amountCents: 100, dueDate: "2026-11-03", daysLate: 3 });
  assert.deepEqual(balanceView([{ status: "processing", dueDate: "2026-11-03", total: 100 }], "2026-10-01", 3, null), { kind: "processing", amountCents: 100 });
});
