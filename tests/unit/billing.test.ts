import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BILLING, totals } from "../../src/lib/billing/types.ts";

test("first bill: plan + setup fee, Texas-style tax on 80%", () => {
  const t = totals([{ label: "Plan", cents: 36900 }, { label: "Setup", cents: 8000 }], DEFAULT_BILLING);
  assert.equal(t.subtotal, 44900);
  assert.equal(t.tax, 2963); // 44900 * 0.8 * 0.0825 = 2963.4
  assert.equal(t.total, 47863);
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

test("the plan's parts add up to $369 and bills are due on the 9th", async () => {
  const { partsTotal } = await import("../../src/lib/billing/types.ts");
  assert.equal(partsTotal(DEFAULT_BILLING.planParts), DEFAULT_BILLING.monthlyCents);
  assert.equal(DEFAULT_BILLING.monthlyCents, 36900);
  assert.equal(DEFAULT_BILLING.dueDay, 9);
});
