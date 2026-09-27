// The Dashboard follow-up list, against real Postgres.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/index";
import { setupDatabase } from "../../lib/db/schema";
import * as data from "../../lib/db/data";
import { saveLead } from "../../lib/leads/store";
import { addDays, dayKey } from "../../lib/time";
import type { Lead } from "../../lib/gmail";

after(async () => { await db()?.end(); });
const TZ = "America/Chicago";
const today = dayKey(Date.now(), TZ);
const hours = (n: number) => Date.now() - n * 3600_000;

function lead(id: string, phone: string, kind: "inquiry" | "application", at: number, extra: Partial<Lead> = {}): Lead {
  return {
    messageId: id, receivedAt: at, subject: "", gmailUrl: "", kind, provider: "Cars.com", type: kind === "application" ? "Credit application" : "Inquiry",
    name: `Person ${phone.slice(-4)}`, phone, email: null, location: null, vehicle: "2018 Honda Civic", vin: null, stock: null,
    comments: null, applicationId: null, loanAmount: kind === "application" ? 15000 : null, downPayment: null, viewUrl: null, ...extra,
  };
}
const kinds = async (repId?: number) => (await data.followUps(today, repId)).map((f) => `${f.kind}:${f.key ?? f.appointmentId}`).sort();

test("each follow-up rule, and clearing it", async () => {
  const sql = db()!;
  await sql`drop table if exists leads, appointments, customers, reps, sources, app_settings cascade`;
  await setupDatabase();
  const zach = (await data.listReps()).find((r) => r.name === "Zach")!;

  await saveLead(lead("m1", "1111111111", "inquiry", hours(30)));           // untouched new lead
  await saveLead(lead("m2", "2222222222", "application", hours(5)));        // loan app needs review
  await data.createAppointment({ customerKey: "p-3333333333", customerName: "No Show Nate", phone: "3333333333", email: "nate@example.com", vehicle: null, repId: zach.id, startsAt: new Date(hours(26)), durationMin: 60, notes: "" });
  await data.createAppointment({ customerKey: "p-5555555555", customerName: "Past Pam", phone: "5555555555", email: null, vehicle: null, repId: null, startsAt: new Date(hours(3)), durationMin: 60, notes: "" });
  await data.updateCustomer("p-4444444444", "Reminder Rita", "follow_up", today);
  const recent = await data.appointmentsBetween(new Date(hours(30)), new Date());
  const nate = recent.find((a) => a.customerName === "No Show Nate")!;
  await data.setAppointmentStatus(nate.id, "no_show");
  assert.equal(nate.email, "nate@example.com", "appointment email is saved");

  const pam = recent.find((a) => a.customerName === "Past Pam")!;
  assert.deepEqual(await kinds(), [
    "loan_app:p-2222222222",
    "new_lead:p-1111111111",
    "no_show:p-3333333333",
    "reminder:p-4444444444",
    "unmarked:p-5555555555",
  ].sort());

  // Filter by salesperson: only Nate's no-show is Zach's.
  assert.deepEqual(await kinds(zach.id), ["no_show:p-3333333333"]);

  // Clear each one the way the Dashboard buttons do.
  await data.markContacted("p-1111111111", null);
  await data.updateCustomer("p-2222222222", null, "financing", "approved");
  await data.markNoShowHandled(nate.id);
  await data.snoozeFollowUp("p-4444444444", null, addDays(today, 1));
  await data.setAppointmentStatus(pam.id, "showed");
  assert.deepEqual(await kinds(), []);
  assert.equal((await data.customerRecords(["p-1111111111"])).get("p-1111111111")!.status, "contacted");
});

test("dashboard counts come from saved leads", async () => {
  const counts = await data.leadCounts(new Date(hours(24)), new Date(hours(24 * 7)));
  assert.deepEqual(counts, { leadsToday: 0, appsToday: 1, week: 2 });
});

test("older databases get the new columns automatically", async () => {
  const sql = db()!;
  await sql`alter table appointments drop column email`;
  const { UPGRADE_SQL } = await import("../../lib/db/schema");
  await sql.unsafe(UPGRADE_SQL);
  const [row] = await sql`select count(*)::int as n from information_schema.columns where table_name = 'appointments' and column_name = 'email'`;
  assert.equal(row.n, 1);
});
