import assert from "node:assert/strict";
import { test } from "node:test";
import { wantsNoMoreEmail } from "../../src/lib/ai/unsubscribe.ts";

test("clear requests to stop are caught", () => {
  for (const t of ["unsubscribe", "Unsubscribe", "STOP", "Please remove me from your list", "stop emailing me", "Take me off this list.", "do not contact me", "opt out"])
    assert.equal(wantsNoMoreEmail(t), true, t);
});
test("normal replies are not", () => {
  for (const t of ["Is the Camry still available?", "I'll stop by Saturday", "Can you send more pictures?", "Cancel my appointment and book Sunday instead", ""])
    assert.equal(wantsNoMoreEmail(t), false, t);
});
