import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEmail } from "../../src/lib/gmail/email.ts";

test("AI emails are well-formed and a subject can't inject extra headers", () => {
  const raw = buildEmail({ from: "sales@example.com", fromName: "Auto One Motors", to: "ana@example.com\nBcc: evil@example.com",
    subject: "Your Camry\r\nBcc: evil@example.com", body: "Hi Ana,\nThanks!\n– The team" });
  const [head, body] = raw.split("\r\n\r\n");
  assert.equal(head.split("\r\n").filter((l) => /^bcc:/i.test(l)).length, 0);
  assert.match(head, /^From: Auto One Motors <sales@example.com>/);
  assert.match(head, /To: ana@example.com Bcc: evil@example.com/); // kept on one line, so Gmail rejects the bad address
  assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), "Hi Ana,\r\nThanks!\r\n– The team");
});

test("non-English subjects are encoded", () => {
  const raw = buildEmail({ from: "a@b.co", to: "c@d.co", subject: "¿Sigue disponible?", body: "Sí" });
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
});
