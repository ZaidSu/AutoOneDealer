// Saved leads + sync, against real Postgres and a fake Gmail inbox.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../../lib/db/index";
import { setupDatabase } from "../../lib/db/schema";
import { syncLeads, getSyncState } from "../../lib/leads/sync";
import { listCustomers, pipeline, searchCustomers, getCustomer } from "../../lib/crm/queries";
import { analytics } from "../../lib/crm/analytics";
import { queryLeads, savedLeadCount, saveLead, rebuildCustomers } from "../../lib/leads/store";
import type { GmailClient } from "../../lib/gmail";

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");
after(async () => { await db()?.end(); });

// 3 leads + 1 reply, newest first
const inbox: Record<string, { from: string; subject: string; text: string; html: string; at: number }> = {
  a1: { from: "comm+x@carsforsalemail.com", subject: "New Loan App Submitted – Carsforsale.com", text: "", html: fx("cfs-finance.html"), at: Date.now() - 1000 },
  b2: { from: "salesleads@cars.com", subject: "Cars.com Phone Lead Notice for Auto One Motors - 2014 Cadillac Cts", text: fx("carscom-phone.txt"), html: "", at: Date.now() - 2000 },
  c3: { from: "dealerdirect@edmunds.com", subject: "Used lead from Edmunds", text: fx("edmunds-adf.txt"), html: "", at: Date.now() - 3000 },
  d4: { from: "customer@example.com", subject: "Re: Cars.com Lead", text: "Is it still available?", html: "", at: Date.now() - 4000 },
};
let reads = 0;
const fakeGmail = {
  mailbox: "txautoone@gmail.com",
  gmailLink: (id: string) => `https://mail.google.com/#all/${id}`,
  async listPage() { return { ids: Object.keys(inbox), next: null, estimate: 4 }; },
  async full(id: string) {
    reads++;
    const m = inbox[id];
    return { id, threadId: id, from: m.from, fromName: m.from, subject: m.subject, snippet: "", receivedAt: m.at, unread: false, text: m.text, html: m.html };
  },
} as unknown as GmailClient;

test("first sync saves leads and customers, remembers the reply as ignored", async () => {
  const sql = db()!;
  await sql`drop table if exists leads, appointments, customers, reps, sources, app_settings, activities cascade`;
  await setupDatabase();
  const result = await syncLeads(fakeGmail);
  assert.ok(!("busy" in result));
  assert.equal(await savedLeadCount(), 3, "the Re: reply is not a lead");
  assert.equal((await getSyncState())!.remaining, 0);
  const { customers, total } = await listCustomers({});
  assert.equal(total, 3, "one customer row per person");
  const jane = customers.find((c) => c.name === "Jane Testcase")!;
  assert.equal(jane.hasApplication, true);
  assert.equal(jane.financing, "needs_review");
  assert.equal(jane.leads.length, 1, "recent leads come along with each row");
});

test("second sync reads nothing from Gmail", async () => {
  reads = 0;
  await syncLeads(fakeGmail, { timeLimitMs: 5000 });
  assert.equal(reads, 0, "every email is read only once");
});

test("saved leads come back complete and searchable", async () => {
  const { leads } = await queryLeads();
  assert.deepEqual(leads.map((l) => l.messageId), ["a1", "b2", "c3"], "newest first");
  assert.equal(leads[0].kind, "application");
  assert.equal(leads[0].loanAmount, 24245);
  assert.equal((await queryLeads({ filter: "application" })).leads.length, 1);
  assert.equal((await queryLeads({ search: "cadillac" })).leads[0].messageId, "b2");
});

test("two syncs at once don't both run", async () => {
  const [a, b] = await Promise.all([syncLeads(fakeGmail), syncLeads(fakeGmail)]);
  assert.equal(["busy" in a, "busy" in b].filter(Boolean).length, 1);
});

test("a run that runs out of time saves its progress and the next run continues", async () => {
  const sql = db()!;
  await sql`delete from leads`;
  await sql`delete from customers`;
  await sql`delete from app_settings where key in ('lead_sync_v2', 'lead_sync_lock')`;
  const slow = Object.assign(Object.create(fakeGmail), { mailbox: "slow-test@example.com" }) as GmailClient;
  await syncLeads(slow, { timeLimitMs: 0 });
  assert.ok((await getSyncState())!.remaining > 0, "unfinished work is recorded");
  assert.equal(await savedLeadCount(), 0);
  await syncLeads(fakeGmail);
  assert.equal((await getSyncState())!.remaining, 0);
  assert.equal(await savedLeadCount(), 3);
});

const L = (id: string, at: number, extra: Record<string, unknown>) => ({
  messageId: id, receivedAt: at, subject: "Lead", gmailUrl: "", kind: "inquiry" as const, provider: "Cars.com", type: "Inquiry",
  name: null, phone: null, email: null, location: null, vehicle: null, vin: null, stock: null, comments: null,
  applicationId: null, loanAmount: null, downPayment: null, viewUrl: null, ...extra,
});

test("the same person is one customer, by phone and then by email", async () => {
  const now = Date.now();
  await saveLead(L("x1", now - 5000, { name: "SAM DRIVER", email: "Sam@Example.com", vehicle: "2019 Toyota Camry", location: "Tulsa, OK" }));
  await saveLead(L("x2", now - 4000, { name: "Sam Driver", phone: "4695550199", email: "sam@example.com", provider: "CarGurus", vehicle: "2018 Honda Civic" }));
  await saveLead(L("x3", now - 3000, { phone: "4695550199", kind: "application", loanAmount: 18000, provider: "CarsForSale" }));
  const hits = await searchCustomers("sam driver");
  assert.equal(hits.length, 1, "all three leads are one person");
  const sam = (await getCustomer(hits[0].key))!;
  assert.equal(sam.name, "Sam Driver", "proper case beats ALL CAPS");
  assert.equal(sam.phone, "4695550199");
  assert.equal(sam.leadsCount, 3);
  assert.equal(sam.heardFrom, "Cars.com", "first source wins");
  assert.equal(sam.scope, "out");
  assert.deepEqual(sam.vehicles, ["2018 Honda Civic", "2019 Toyota Camry"]);
  assert.equal((await searchCustomers("5550199")).length, 1, "phone digits search");
});

test("rebuilding customers from leads gives the same rows as saving them one by one", async () => {
  const sql = db()!;
  const snapshot = async () => (await sql`select key, name, phone, lead_count, app_count, vehicles, first_provider from customers where lead_count > 0 order by key`).map((r) => ({ ...r }));
  const before = await snapshot();
  await sql`delete from customers`;
  await rebuildCustomers();
  assert.deepEqual(await snapshot(), before);
});

test("pipeline, and analytics counted in the database", async () => {
  const cols = await pipeline({ days: 30 });
  assert.equal(cols.find((c) => c.status === "new")!.count, 4);
  const data = (await analytics(new Date(Date.now() - 86400000), "America/Chicago"))!;
  assert.equal([...data.leadsByDay.values()].reduce((a, b) => a + b, 0), 6);
  assert.equal(data.people.reduce((n, p) => n + p.n, 0), 4);
});
