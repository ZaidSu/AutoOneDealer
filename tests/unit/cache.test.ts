import assert from "node:assert/strict";
import { test } from "node:test";
import { cached, dropCached } from "../../src/lib/utils/cache.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("remembers a value for a while, and forgets it when told to", async () => {
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cached("t:a", 1000, load), 1);
  assert.equal(await cached("t:a", 1000, load), 1);
  dropCached("t:");
  assert.equal(await cached("t:a", 1000, load), 2);
});

test("requests at the same moment share one piece of work", async () => {
  let calls = 0;
  const load = async () => { calls++; await sleep(30); return "x"; };
  const [a, b, c] = await Promise.all([cached("t:b", 1000, load), cached("t:b", 1000, load), cached("t:b", 1000, load)]);
  assert.deepEqual([a, b, c, calls], ["x", "x", "x", 1]);
});

test("a request that is stuck is not handed to a retry: the retry works it out again", async () => {
  let calls = 0;
  // the first call never finishes (a dead database connection); later ones work
  const load = () => (++calls === 1 ? new Promise<string>(() => undefined) : Promise.resolve("fresh"));
  void cached("t:c", 1000, load, { shareForMs: 40 });   // stuck
  await sleep(80);                                       // the page gives up waiting and retries
  assert.equal(await cached("t:c", 1000, load, { shareForMs: 40 }), "fresh");
  assert.equal(calls, 2);
});

test("a failure is not remembered", async () => {
  let calls = 0;
  const load = async () => { if (++calls === 1) throw new Error("boom"); return "ok"; };
  await assert.rejects(cached("t:d", 1000, load), /boom/);
  assert.equal(await cached("t:d", 1000, load), "ok");
});
