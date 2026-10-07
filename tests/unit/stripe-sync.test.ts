import assert from "node:assert/strict";
import { test } from "node:test";
import { mapStripeInvoice, usageCharges } from "../../src/lib/billing/stripe-map.ts";

const base = { id: "in_1", number: "ABC-0001", status: "open", created: 1790000000, total: 48900, hosted_invoice_url: "https://invoice.stripe.com/i/x" };

test("a Stripe invoice becomes a bill with a Pay link and its line items", () => {
  const b = mapStripeInvoice({ ...base, lines: { data: [{ amount: 37900, description: "AutoDash" }, { amount: 9900, description: "Connection fee" }, { amount: 1100, description: "Phone number fee" }] } } as never, "America/Chicago");
  assert.ok(b);
  assert.equal(b.total, 48900);
  assert.equal(b.items.length, 3);
  assert.equal(b.status, "open");
  assert.equal(b.hostedUrl, "https://invoice.stripe.com/i/x");
  assert.equal(b.source, "stripe");
});

test("paid shows as paid, drafts and voids are hidden, a discount is its own line", () => {
  assert.equal(mapStripeInvoice({ ...base, status: "paid", lines: { data: [] } } as never)?.status, "paid");
  assert.equal(mapStripeInvoice({ ...base, status: "draft" } as never), null);
  assert.equal(mapStripeInvoice({ ...base, status: "void" } as never), null);
  const d = mapStripeInvoice({ ...base, total_discount_amounts: [{ amount: 5000 }], lines: { data: [{ amount: 5000, description: "Plan" }] } } as never);
  assert.deepEqual(d?.items.at(-1), { label: "Discount", cents: -5000 });
});

test("a failed payment attempt adds a note", () => {
  assert.match(mapStripeInvoice({ ...base, attempt_count: 2, lines: { data: [] } } as never)?.note ?? "", /didn't go through/);
});

test("extra usage is charged only past the included amount", () => {
  const s = { includedEmails: 1000, includedTexts: 500, extraEmailCents: 2, extraTextCents: 5 };
  assert.deepEqual(usageCharges({ emails: 900, texts: 400 }, s, "September 2026"), []);
  const c = usageCharges({ emails: 1100, texts: 510 }, s, "September 2026");
  assert.deepEqual(c.map((x) => [x.kind, x.cents]), [["emails", 200], ["texts", 50]]);
});
