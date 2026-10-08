import test from "node:test";
import assert from "node:assert/strict";
import { foldAttempts } from "../../src/lib/inventory/attempts.ts";

test("page results add up run after run", () => {
  let s = foldAttempts({}, [{ page: 1, route: "direct", ok: true, note: "ok" }, { page: 3, route: "direct", ok: false, note: "blocked (403)" }, { page: 3, route: "helper", ok: false, note: "error 500" }], 1000);
  assert.equal(s["1"].ok, 1);
  assert.equal(s["3"].fail, 1);
  assert.match(s["3"].lastError!, /direct: blocked \(403\); helper: error 500/);
  s = foldAttempts(s, [{ page: 3, route: "direct", ok: false, note: "blocked (403)" }, { page: 3, route: "helper", ok: true, note: "24 cars" }], 2000);
  assert.equal(s["3"].fail, 1, "worked through the helper this time");
  assert.equal(s["3"].ok, 1);
  assert.deepEqual(s["3"].routes.direct, [0, 2]);
  assert.deepEqual(s["3"].routes.helper, [1, 1]);
});
