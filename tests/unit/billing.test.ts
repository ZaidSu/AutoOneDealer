import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BILLING, partsTotal, totals } from "../../src/lib/billing/types.ts";

test("tax math still works when a rate is set: 8.25% on 80% of the bill", () => {
  const t = totals([{ label: "Plan", cents: 36900 }, { label: "Connection", cents: DEFAULT_BILLING.setupFeeCents }], { taxRatePercent: 8.25, taxablePercent: 80 });
  assert.equal(DEFAULT_BILLING.setupFeeCents, 9900);
  assert.equal(t.subtotal, 46800);
  assert.equal(t.tax, 3089); // 46800 * 0.8 * 0.0825 = 3088.8
  assert.equal(t.total, 49889);
});

test("no tax when the rate is zero", () => {
  assert.deepEqual(totals([{ label: "Plan", cents: 36900 }], { taxRatePercent: 0, taxablePercent: 80 }), { subtotal: 36900, tax: 0, total: 36900 });
});

import { createHmac } from "node:crypto";
test("Stripe webhook signatures: right secret passes, wrong or old ones fail", async () => {
  const { verifyWebhook } = await import("../../src/lib/billing/stripe.ts");
  const body = '{"type":"checkout.session.completed"}';
  const t = 1_800_000_000;
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  assert.equal(verifyWebhook(body, `t=${t},v1=${sig}`, "whsec_test", t * 1000), true);
  assert.equal(verifyWebhook(body, `t=${t},v1=${sig}`, "whsec_other", t * 1000), false);
  assert.equal(verifyWebhook(body + " ", `t=${t},v1=${sig}`, "whsec_test", t * 1000), false);
  assert.equal(verifyWebhook(body, `t=${t},v1=${sig}`, "whsec_test", (t + 900) * 1000), false);
});

test("the plan's parts add up to the monthly price and bills are due on the 9th", async () => {
  const { partsTotal } = await import("../../src/lib/billing/types.ts");
  assert.equal(partsTotal(DEFAULT_BILLING.planParts), DEFAULT_BILLING.monthlyCents);
  assert.equal(DEFAULT_BILLING.dueDay, 9);
});

test("GoCardless webhook signatures: only the right secret and untouched body pass", async () => {
  const { validGoCardlessSignature } = await import("../../src/lib/billing/gocardless.ts");
  const body = '{"events":[{"resource_type":"payments","action":"confirmed"}]}';
  const sig = createHmac("sha256", "gc_secret").update(body).digest("hex");
  assert.equal(validGoCardlessSignature(body, sig, "gc_secret"), true);
  assert.equal(validGoCardlessSignature(body + " ", sig, "gc_secret"), false);
  assert.equal(validGoCardlessSignature(body, sig, "other"), false);
  assert.equal(validGoCardlessSignature(body, null, "gc_secret"), false);
});

test("the standard plan is $379 a month, has no sales tax, and the plan parts add up to it", () => {
  assert.equal(DEFAULT_BILLING.monthlyCents, 37900);
  assert.equal(DEFAULT_BILLING.taxRatePercent, 0);
  assert.equal(partsTotal(DEFAULT_BILLING.planParts), 37900);
  assert.deepEqual(totals([{ label: "Plan", cents: 37900 }, { label: "Connection", cents: 9900 }], DEFAULT_BILLING), { subtotal: 47800, tax: 0, total: 47800 });
});

import { repricedBill } from "../../src/lib/billing/types.ts";
test("an unpaid bill made at the old price with tax is brought to $379 with no tax", () => {
  const plan = "Auto One Motors monthly plan";
  const old = { items: [{ label: plan, cents: 36900 }, { label: "One-time connection fee", cents: 9900 }], subtotal: 46800, tax: 3089, total: 49889 };
  const fixed = repricedBill(old, plan, { monthlyCents: 37900, taxRatePercent: 0, taxablePercent: 80 })!;
  assert.equal(fixed.items[0].cents, 37900);
  assert.equal(fixed.items[1].cents, 9900); // the connection fee is untouched
  assert.deepEqual({ subtotal: fixed.subtotal, tax: fixed.tax, total: fixed.total }, { subtotal: 47800, tax: 0, total: 47800 });
  assert.equal(repricedBill(fixed, plan, { monthlyCents: 37900, taxRatePercent: 0, taxablePercent: 80 }), null); // already current
});
