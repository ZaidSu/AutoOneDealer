import assert from "node:assert/strict";
import { test } from "node:test";
import { ALERT_EVERY_MS, bannerText, nextHealth, shouldAlert } from "../../src/lib/gmail/health-rules.ts";

test("working Gmail: no bar, no alert", () => {
  const h = nextHealth(null, { ok: true }, 1000);
  assert.equal(h.ok, true);
  assert.equal(bannerText(h), null);
  assert.equal(shouldAlert(h, 2000), false);
});
test("it breaks: alert once, remember when it started, alert again after 12 hours", () => {
  let h = nextHealth(null, { ok: false, code: "token:invalid_grant", message: "Google cancelled this connection." }, 1000);
  assert.equal(h.since, 1000);
  assert.equal(bannerText(h), "Google cancelled this connection.");
  assert.equal(shouldAlert(h, 1000), true);
  h = { ...h, alertedAt: 1000 };
  h = nextHealth(h, { ok: false, code: "token:invalid_grant", message: "Google cancelled this connection." }, 5000);
  assert.equal(h.since, 1000, "still counted from the first failure");
  assert.equal(shouldAlert(h, 5000), false, "already warned");
  assert.equal(shouldAlert(h, 1000 + ALERT_EVERY_MS), true, "warn again after 12 hours");
});
test("fixed: back to normal and the next break warns again", () => {
  const broken = { ...nextHealth(null, { ok: false }, 1), alertedAt: 1 };
  const fixed = nextHealth(broken, { ok: true }, 10);
  assert.equal(fixed.ok, true);
  assert.equal(shouldAlert(nextHealth(fixed, { ok: false }, 20), 20), true);
});
