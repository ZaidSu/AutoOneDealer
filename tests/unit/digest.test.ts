import { test } from "node:test";
import assert from "node:assert/strict";
import { digestBody, digestIsEmpty, digestSubject, peopleToContact, type DigestData } from "../../src/lib/ai/digest-format.ts";

const TZ = "America/Chicago";
const base: DigestData = {
  dealership: "Auto One Motors", timeZone: TZ, from: Date.parse("2026-10-06T18:00:00Z"), to: Date.parse("2026-10-06T19:30:00Z"), appUrl: "https://auto-one-dealer.vercel.app",
  newPeople: [], wroteBack: [], aiSent: [], draftsWaiting: 0, appointments: [], newCars: [], soldCars: [],
};

test("an update with nothing in it is recognised, so it isn't sent", () => {
  assert.equal(digestIsEmpty(base), true);
  assert.equal(digestIsEmpty({ ...base, newCars: ["2020 Kia Soul"] }), true, "inventory changes alone don't justify an email");
  assert.equal(digestIsEmpty({ ...base, draftsWaiting: 1 }), false);
});

test("the update lists who to contact, what they said, and what the AI already did", () => {
  const d: DigestData = {
    ...base,
    newPeople: [
      { name: "Maria Gomez", phone: "2145550123", email: "maria@example.com", vehicle: "2019 Honda Civic", provider: "CarsForSale", message: "Is it still available?", contacted: false, ai: "sent", aiSentAt: Date.parse("2026-10-06T18:40:00Z"), at: Date.parse("2026-10-06T18:35:00Z") },
      { name: "Zaid", phone: null, email: "reply-808138aa@messages.offerup.com", vehicle: "2015 Nissan Murano", provider: "OfferUp", message: "Hello", contacted: false, ai: "draft", aiSentAt: null, at: Date.parse("2026-10-06T19:00:00Z") },
      { name: "Sam Lee", phone: "4695550100", email: null, vehicle: "2018 Ford F-150", provider: "Cars.com", message: null, contacted: true, ai: "none", aiSentAt: null, at: Date.parse("2026-10-06T18:10:00Z") },
    ],
    wroteBack: [{ name: "Priya", via: "text", phone: "9725550111", email: null, text: "Can I come at 5?", at: Date.parse("2026-10-06T19:10:00Z") }],
    aiSent: [{ name: "Maria Gomez", email: "maria@example.com", vehicle: "2019 Honda Civic", at: Date.parse("2026-10-06T18:40:00Z"), auto: true }],
    draftsWaiting: 1,
    appointments: [{ name: "Chris", phone: "2145550999", vehicle: "2021 Kia K5", at: Date.parse("2026-10-07T15:00:00Z") }],
  };
  assert.equal(peopleToContact(d).length, 2, "Sam was already contacted");
  const subject = digestSubject(d);
  assert.match(subject, /^AutoDash update, 2:30 PM: 3 new customers, 1 wrote back, 3 to contact$/);
  assert.doesNotMatch(subject, /\blead|loan app/i, "so AutoDash's own lead import never mistakes it for a customer");
  const body = digestBody(d);
  assert.match(body, /PLEASE CONTACT THESE PEOPLE \(3\)/);
  assert.match(body, /Maria Gomez \(\(214\) 555-0123, maria@example\.com\)/);
  assert.match(body, /asked about the 2019 Honda Civic/);
  assert.match(body, /They said: "Is it still available\?"/);
  assert.match(body, /already emailed them at 1:40 PM/);
  assert.match(body, /Zaid \(no phone: answer in the OfferUp app\)/, "OfferUp buyers have no phone; the private address isn't shown as an email");
  assert.match(body, /reply written, waiting for you to approve it/);
  assert.match(body, /Priya \(\(972\) 555-0111\) wrote back by text/);
  assert.match(body, /ALREADY CONTACTED \(1\)\n- Sam Lee/);
  assert.match(body, /WHAT THE AI EMAILED \(1\)\n- 1:40 PM: Maria Gomez about the 2019 Honda Civic \(sent automatically\)/);
  assert.match(body, /WAITING FOR YOU: 1 AI reply is written .* https:\/\/auto-one-dealer\.vercel\.app\/ai\/emails/);
  assert.match(body, /APPOINTMENTS IN THE NEXT 24 HOURS\n- Oct 7, 10:00 AM: Chris \(214\) 555-0999, 2021 Kia K5/);
  assert.doesNotMatch(body, /messages\.offerup\.com/);
});
