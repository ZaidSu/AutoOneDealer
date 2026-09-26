import { test } from "node:test";
import assert from "node:assert/strict";
import { randomToken, seal, unseal } from "../../lib/auth/crypto.ts";
import { can, parseStaffAccess } from "../../lib/auth/access.ts";

const secret = "x".repeat(40);

test("sealed cookies round-trip", () => {
  const value = { email: "a@b.com", n: 1 };
  assert.deepEqual(unseal(seal(value, secret), secret), value);
});

test("tampered or wrong-key cookies are rejected", () => {
  const sealed = seal({ ok: true }, secret);
  const parts = sealed.split(".");
  const flipped = parts[2].startsWith("A") ? "B" + parts[2].slice(1) : "A" + parts[2].slice(1);
  assert.equal(unseal([parts[0], parts[1], flipped].join("."), secret), null);
  assert.equal(unseal(sealed, "y".repeat(40)), null);
  assert.equal(unseal("garbage", secret), null);
  assert.equal(unseal(undefined, secret), null);
});

test("random tokens are unique", () => {
  assert.notEqual(randomToken(), randomToken());
});

test("staff list parsing", () => {
  const staff = parseStaffAccess(" Owner@X.com:owner, sam@x.com:SALESPERSON, bad@x.com:admin, nope ", "mail@x.com");
  assert.equal(staff.get("owner@x.com"), "owner");
  assert.equal(staff.get("sam@x.com"), "salesperson");
  assert.equal(staff.has("bad@x.com"), false, "unknown roles are ignored");
  assert.equal(staff.has("mail@x.com"), false, "fallback owner only applies when list is empty");
});

test("mailbox owner is the only staff member when no list is set", () => {
  const staff = parseStaffAccess("", " Dealer@Gmail.com ");
  assert.deepEqual([...staff.entries()], [["dealer@gmail.com", "owner"]]);
  assert.equal(parseStaffAccess("", "").size, 0);
});

test("role permissions", () => {
  assert.equal(can.manageIntegrations("owner"), true);
  assert.equal(can.manageIntegrations("manager"), true);
  assert.equal(can.manageIntegrations("salesperson"), false);
  assert.equal(can.useDeveloperTools("developer"), true);
  assert.equal(can.useDeveloperTools("manager"), false);
});
