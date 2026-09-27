// Runs against a real Postgres: DATABASE_URL=postgres://... npm run test:db
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/index";
import { setupDatabase } from "../../lib/db/schema";
import * as data from "../../lib/db/data";

after(async () => { await db()?.end(); });

test("setup is repeatable and seeds reps and sources", async () => {
  const sql = db()!;
  await sql`drop table if exists appointments, customers, reps, sources, app_settings cascade`;
  await setupDatabase();
  await setupDatabase(); // second run must not duplicate anything
  assert.deepEqual((await data.listReps()).map((r) => r.name), ["Abdul", "Steve", "Zach"]);
  const sources = (await data.listSources()).map((s) => s.name);
  assert.ok(sources.includes("NCU (myncu.com)") && sources.includes("Word of mouth"));
  assert.equal(new Set(sources).size, sources.length);
});

test("reps can be added, removed and re-added without losing history", async () => {
  await data.addRep("Maria");
  const maria = (await data.listReps()).find((r) => r.name === "Maria")!;
  await data.updateCustomer("p-4695550100", "Jane Doe", "rep", maria.id);
  await data.removeRep(maria.id);
  assert.equal((await data.listReps()).some((r) => r.name === "Maria"), false);
  assert.equal((await data.customerRecords(["p-4695550100"])).get("p-4695550100")!.repId, null, "her customers become unassigned");
  await data.addRep("maria");
  assert.equal((await data.listReps()).filter((r) => r.name.toLowerCase() === "maria").length, 1, "re-adding reactivates");
});

test("customer labels save and purchase date is recorded once", async () => {
  const key = "p-2145550123";
  await data.updateCustomer(key, "Marcus Hill", "status", "purchased");
  await data.updateCustomer(key, null, "financing", "approved");
  await data.updateCustomer(key, null, "heard_from", "Word of mouth");
  await data.updateCustomer(key, null, "state_scope", "out");
  await data.updateCustomer(key, null, "notes", "Wants to trade in a 2012 Accord");
  const r = (await data.customerRecords([key])).get(key)!;
  assert.equal(r.status, "purchased");
  assert.ok(r.purchasedAt);
  assert.equal(r.financing, "approved");
  assert.equal(r.heardFrom, "Word of mouth");
  assert.equal(r.stateScope, "out");
  assert.equal(r.notes, "Wants to trade in a 2012 Accord");
  assert.equal(r.name, "Marcus Hill");
});

test("appointments: booking, double-booking check, and status", async () => {
  const zach = (await data.listReps()).find((r) => r.name === "Zach")!;
  const start = new Date(Date.now() + 86400000);
  await data.createAppointment({ customerKey: "p-9725550177", customerName: "Pat Example", phone: "9725550177", vehicle: "2019 Toyota Camry", repId: zach.id, startsAt: start, durationMin: 60, notes: "" });
  const clash = await data.findConflict(zach.id, new Date(start.getTime() + 30 * 60000), 60);
  assert.equal(clash?.customerName, "Pat Example");
  assert.equal(await data.findConflict(zach.id, new Date(start.getTime() + 60 * 60000), 60), null, "back-to-back is fine");
  const record = (await data.customerRecords(["p-9725550177"])).get("p-9725550177")!;
  assert.equal(record.status, "appointment");
  assert.equal(record.repId, zach.id, "booking assigns the rep if nobody was assigned");
  const next = (await data.appointmentsForCustomers(["p-9725550177"])).get("p-9725550177")!;
  await data.setAppointmentStatus(next.id, "no_show");
  assert.equal((await data.recentNoShows(new Date(0))).length, 1);
  assert.equal(await data.findConflict(zach.id, start, 60), null, "no-shows don't block the slot");
});

test("settings store and delete", async () => {
  await data.setSetting("gmail", "sealed-value");
  assert.equal(await data.getSetting("gmail"), "sealed-value");
  await data.setSetting("gmail", null);
  assert.equal(await data.getSetting("gmail"), null);
});
