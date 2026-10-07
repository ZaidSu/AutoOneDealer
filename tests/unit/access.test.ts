import assert from "node:assert/strict";
import { test } from "node:test";
import { can, normalizeEmail, parseStaffAccess } from "../../src/lib/auth/access.ts";
import { seal, unseal } from "../../src/lib/auth/crypto.ts";

test("STAFF_ACCESS lists who may sign in and ignores unknown roles", () => {
  const staff = parseStaffAccess("Boss@X.com:owner, cpa@y.com:accountant, bad@z.com:wizard, nonsense", "other@x.com");
  assert.equal(staff.get("boss@x.com"), "owner");
  assert.equal(staff.get("cpa@y.com"), "accountant");
  assert.equal(staff.has("bad@z.com"), false);
  assert.equal(staff.has("other@x.com"), false);
});

test("with no STAFF_ACCESS, OWNER_EMAIL is the only owner", () => {
  const staff = parseStaffAccess("", " Me@Example.com ");
  assert.equal(staff.size, 1);
  assert.equal(staff.get("me@example.com"), "owner");
  assert.equal(parseStaffAccess("", "").size, 0);
});

test("only owners can edit", () => {
  assert.equal(can.edit("owner"), true);
  assert.equal(can.edit("accountant"), false);
  assert.equal(normalizeEmail("  A@B.com "), "a@b.com");
});

test("sealed cookies round-trip and reject tampering or the wrong secret", () => {
  const secret = "x".repeat(40);
  const token = seal({ email: "a@b.com" }, secret);
  assert.deepEqual(unseal(token, secret), { email: "a@b.com" });
  assert.equal(unseal(token, "y".repeat(40)), null);
  assert.equal(unseal(token.slice(0, -2) + "AA", secret), null);
  assert.equal(unseal("garbage", secret), null);
});
