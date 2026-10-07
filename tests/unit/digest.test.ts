import { test } from "node:test";
import assert from "node:assert/strict";
import { digestBody, digestIsEmpty, digestSubject, type DigestData } from "../../src/lib/ai/digest-format.ts";

const TZ = "America/Chicago";
const base: DigestData = {
  dealership: "Auto One Motors", timeZone: TZ, from: Date.parse("2026-10-06T18:00:00Z"), to: Date.parse("2026-10-06T19:30:00Z"), appUrl: "https://auto-one-dealer.vercel.app",
  waiting: [], draftsWaiting: 0, appointments: [], newCars: [], soldCars: [],
};

test("nothing is sent when nobody is waiting, and car changes alone never justify an email", () => {
  assert.equal(digestIsEmpty(base), true);
  assert.equal(digestIsEmpty({ ...base, newCars: ["2020 Kia Soul"], soldCars: ["2018 Ford F-150"] }), true);
  assert.equal(digestIsEmpty({ ...base, draftsWaiting: 1 }), false);
});

test("the email is one clear list: who, what they want, what was said, and a link to talk to them", () => {
  const d: DigestData = {
    ...base,
    waiting: [
      { name: "Maria Gomez", phone: "2145550123", email: "maria@example.com", vehicle: "2019 Honda Civic", provider: "CarsForSale", message: "Is it still available?",
        link: "https://auto-one-dealer.vercel.app/customers/p%3A2145550123", ai: "sent", aiSentAt: Date.parse("2026-10-06T18:40:00Z"), aiText: "Hi Maria, yes it is!",
        replies: [{ via: "text", text: "Can I come at 5?", at: Date.parse("2026-10-06T19:10:00Z") }], at: Date.parse("2026-10-06T18:35:00Z") },
      { name: "Zaid", phone: null, email: "reply-808138aa@messages.offerup.com", vehicle: "2015 Nissan Murano", provider: "OfferUp", message: "Hello", link: null, ai: "draft", aiSentAt: null, aiText: null, replies: [], at: Date.parse("2026-10-06T19:00:00Z") },
    ],
  };
  const subject = digestSubject(d);
  assert.match(subject, /^🚨 IMPORTANT: 2 customers are waiting to hear from you \(1 wrote back 💬\), 2:30 PM$/);
  assert.doesNotMatch(subject, /\blead|loan app/i, "so AutoDash's own lead import never mistakes it for a customer");
  const body = digestBody(d);
  assert.match(body, /🚨 2 CUSTOMERS WAITING TO BE CONTACTED/);
  assert.match(body, /1\. 👤 Maria Gomez {2}💬 WROTE BACK/);
  assert.match(body, /📞 \(214\) 555-0123 {2}\| {2}maria@example\.com/);
  assert.match(body, /🚙 Wants: 2019 Honda Civic/);
  assert.match(body, /🗣️ They said: "Is it still available\?"/);
  assert.match(body, /🤖 AI emailed them at 1:40 PM: "Hi Maria, yes it is!"/);
  assert.match(body, /💬 They wrote back by text at 2:10 PM: "Can I come at 5\?"/);
  assert.match(body, /👉 Talk to them: https:\/\/auto-one-dealer\.vercel\.app\/customers\/p%3A2145550123/);
  assert.match(body, /no phone: answer in the OfferUp app/);
  assert.match(body, /📝 AI wrote a reply that is waiting for your OK/);
  assert.doesNotMatch(body, /messages\.offerup\.com/);
  assert.doesNotMatch(body, /INVENTORY|APPOINTMENTS/, "no cars or extras unless turned on");
});

test("one customer reads singular, and the subject has no 'lead' even with no one waiting", () => {
  const one = { ...base, waiting: [{ name: "A", phone: "2145550000", email: null, vehicle: null, provider: null, message: null, link: null, ai: "none" as const, aiSentAt: null, aiText: null, replies: [], at: base.to - 1000 }] };
  assert.match(digestSubject(one), /1 customer is waiting/);
  assert.match(digestSubject(base), /nobody is waiting/);
});
