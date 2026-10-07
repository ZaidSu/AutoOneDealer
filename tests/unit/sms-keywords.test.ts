import assert from "node:assert/strict";
import { test } from "node:test";
import { keywordFor } from "../../src/lib/sms/keywords.ts";

test("STOP words always opt out, in any case or punctuation", () => {
  for (const w of ["STOP", "stop", " Stop. ", "Unsubscribe", "CANCEL"]) assert.equal(keywordFor(w, false), "stop");
});
test("YES is an answer, not an opt-in, unless they had opted out", () => {
  assert.equal(keywordFor("Yes", false), null);
  assert.equal(keywordFor("yes!", true), "start");
  assert.equal(keywordFor("START", false), "start");
});
test("HELP and normal sentences", () => {
  assert.equal(keywordFor("help", false), "help");
  assert.equal(keywordFor("Please stop by tomorrow?", false), null);
});
