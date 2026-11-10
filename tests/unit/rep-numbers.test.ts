import assert from "node:assert/strict";
import { test } from "node:test";
import { repAlertNumbers, ten } from "../../src/lib/ai/rep-numbers.ts";

const info = (over = {}) => ({ phone: "(469) 888-0803", repAlertPhone: "", repAlertPhone2: "", repAlertPhone3: "", ...over });

test("the first number falls back to the dealership phone", () => {
  assert.deepEqual(repAlertNumbers(info()), ["4698880803"]);
});
test("up to three different numbers, in order, no repeats", () => {
  assert.deepEqual(repAlertNumbers(info({ repAlertPhone: "214-555-0101", repAlertPhone2: "(214) 555-0102", repAlertPhone3: "214.555.0101" })), ["2145550101", "2145550102"]);
  assert.deepEqual(repAlertNumbers(info({ repAlertPhone: "2145550101", repAlertPhone2: "2145550102", repAlertPhone3: "+1 214 555 0103" })), ["2145550101", "2145550102", "2145550103"]);
});
test("bad numbers and the AutoDash number are skipped", () => {
  assert.deepEqual(repAlertNumbers(info({ repAlertPhone: "12345", repAlertPhone2: "2145550102" }), []), ["2145550102"]);
  assert.deepEqual(repAlertNumbers(info({ repAlertPhone: "2145550101", repAlertPhone2: "2145550102" }), ["+12145550101"]), ["2145550102"]);
  assert.equal(ten("1-469-888-0803"), "4698880803");
});
