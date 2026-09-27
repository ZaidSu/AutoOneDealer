// Saved leads + sync, against real Postgres and a fake Gmail inbox.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../../lib/db/index";
import { setupDatabase } from "../../lib/db/schema";
import { syncLeads, getSyncState } from "../../lib/leads/sync";
import { queryLeads, allLeads, leadsFor, savedLeadCount } from "../../lib/leads/store";
import { groupCustomers } from "../../lib/customers";
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
  async listPage() { return { ids: Object.keys(inbox), next: null }; },
  async full(id: string) {
    reads++;
    const m = inbox[id];
    return { id, threadId: id, from: m.from, fromName: m.from, subject: m.subject, snippet: "", receivedAt: m.at, unread: false, text: m.text, html: m.html };
  },
} as unknown as GmailClient;

test("first sync saves leads, remembers the reply as ignored", async () => {
  const sql = db()!;
  await sql`drop table if exists leads, appointments, customers, reps, sources, app_settings cascade`;
  await setupDatabase();
  const result = await syncLeads(fakeGmail, { budget: 2 }); // batch smaller than the inbox
  assert.ok(!("busy" in result));
  assert.equal(result.remaining, 2, "two emails left for the next run");
  await syncLeads(fakeGmail, { budget: 10 });
  assert.equal(await savedLeadCount(), 3, "the Re: reply is not a lead");
  assert.equal((await getSyncState())!.remaining, 0);
});

test("second sync reads nothing from Gmail", async () => {
  reads = 0;
  await syncLeads(fakeGmail, { budget: 10 });
  assert.equal(reads, 0, "every email is read only once");
});

test("saved leads come back complete and searchable", async () => {
  const { leads } = await queryLeads();
  assert.deepEqual(leads.map((l) => l.messageId), ["a1", "b2", "c3"], "newest first");
  const app = leads[0];
  assert.equal(app.kind, "application");
  assert.equal(app.loanAmount, 24245);
  assert.equal(app.name, "Jane Testcase");
  assert.equal((await queryLeads({ filter: "application" })).leads.length, 1);
  assert.equal((await queryLeads({ search: "cadillac" })).leads[0].messageId, "b2");
  assert.equal((await queryLeads({ search: "555-0142" })).leads[0].messageId, "c3", "phone search ignores formatting");
  assert.equal((await queryLeads({ search: "zz%_zz" })).leads.length, 0, "special characters are safe");
  assert.equal((await leadsFor({ phone: "2145550123" })).length, 1);
  assert.equal(groupCustomers(await allLeads()).length, 3);
});

test("two syncs at once don't both run", async () => {
  const [a, b] = await Promise.all([syncLeads(fakeGmail), syncLeads(fakeGmail)]);
  assert.equal([a, b].filter((r) => "busy" in r).length, 1);
});

test("a run that runs out of time saves its progress and the next run continues", async () => {
  const sql = db()!;
  await sql`delete from leads`;
  await sql`delete from app_settings where key in ('lead_sync_state', 'lead_sync_lock')`;
  const slow = Object.assign(Object.create(fakeGmail), {
    mailbox: "slow-test@example.com", // separate mailbox so the read cache doesn't apply
    async full(id: string) { await new Promise((r) => setTimeout(r, 300)); return (fakeGmail as any).full(id); },
  }) as GmailClient;
  const first = await syncLeads(slow, { budget: 10, timeLimitMs: 0 }); // out of time before reading anything
  assert.ok(!("busy" in first));
  const state = (await getSyncState())!;
  assert.equal(state.remaining, 4, "the unfinished work is recorded");
  assert.equal(await savedLeadCount(), 0);
  await syncLeads(fakeGmail, { budget: 10 });
  assert.equal((await getSyncState())!.remaining, 0);
  assert.equal(await savedLeadCount(), 3);
});
