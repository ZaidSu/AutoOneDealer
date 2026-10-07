import { test } from "node:test";
import assert from "node:assert/strict";
import { customerKey, groupCustomers, parseCustomerKey, type LeadRecord } from "../../src/lib/customers/index.ts";

function lead(over: Partial<LeadRecord>): LeadRecord {
  return {
    kind: "inquiry", provider: "Cars.com", type: "Inquiry", name: null, phone: null, email: null, location: null,
    vehicle: null, vin: null, stock: null, comments: null, applicationId: null, loanAmount: null, downPayment: null,
    viewUrl: null, messageId: Math.random().toString(16).slice(2), receivedAt: 0, ...over,
  };
}

test("same phone from different sites becomes one customer", () => {
  const customers = groupCustomers([
    lead({ name: "JANE DOE", phone: "4695550100", provider: "Cars.com", vehicle: "2014 Cadillac CTS", receivedAt: 1 }),
    lead({ name: "Jane Doe", phone: "4695550100", provider: "CarsForSale", kind: "application", receivedAt: 3 }),
    lead({ name: "Other Person", phone: "2145550199", receivedAt: 2 }),
  ]);
  assert.equal(customers.length, 2);
  const jane = customers[0];
  assert.equal(jane.name, "Jane Doe", "prefers properly-cased name");
  assert.deepEqual(jane.sources, ["Cars.com", "CarsForSale"]);
  assert.equal(jane.hasApplication, true);
  assert.equal(jane.leads.length, 2);
  assert.equal(jane.firstSeen, 1);
  assert.equal(jane.lastSeen, 3);
  assert.deepEqual(jane.vehicles, ["2014 Cadillac CTS"]);
});

test("email-only lead joins the phone customer when a later lead has both", () => {
  const customers = groupCustomers([
    lead({ email: "sam@example.com", receivedAt: 1 }),
    lead({ email: "sam@example.com", phone: "9725550177", receivedAt: 2 }),
  ]);
  assert.equal(customers.length, 1);
  assert.deepEqual(customers[0].phones, ["9725550177"]);
});

test("leads without phone or email are skipped rather than lumped together", () => {
  assert.equal(groupCustomers([lead({ name: "Mystery" }), lead({ name: "Mystery 2" })]).length, 0);
});

test("customer keys round-trip and reject junk", () => {
  assert.deepEqual(parseCustomerKey(customerKey({ phone: "4695550100", email: null })!), { phone: "4695550100" });
  assert.deepEqual(parseCustomerKey(customerKey({ phone: null, email: "A@Example.com" })!), { email: "a@example.com" });
  assert.equal(parseCustomerKey("p-123"), null);
  assert.equal(parseCustomerKey("../etc"), null);
});
