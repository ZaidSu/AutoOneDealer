// Copies lead emails from Gmail into the database. Each email is read once, ever.
//  1. New leads: one small Gmail search for anything newer than the newest saved lead (usually 1 request).
//  2. First-time import: walks back through the last 12 months one page at a time, remembering where it
//     stopped, so it never re-lists what it has already checked.
// Every run stops on time and records its progress, so it can't run past Vercel's limit.
import { bgDb, readyDb } from "@/lib/db";
import { dataStartDate } from "@/lib/dealership";
import { LEAD_QUERIES, mapLimit, readLead, type GmailClient } from "@/lib/gmail";
import { ensureCustomersBuilt, knownMessageIds, markIgnored, rebuildCustomers, saveLead } from "./store";

export const HISTORY = "newer_than:365d";
const STATE_KEY = "lead_sync_v2";
const LOCK_KEY = "lead_sync_lock";
const PAGE = 100;

export type SyncState = {
  lastRun: number;
  saved: number;       // leads saved in total
  remaining: number;   // rough count of older emails still to import (0 = done)
  failed: number;
  added?: number;      // new leads saved by the last run
  backfill?: { token: string | null; done: boolean; estimate: number };
};

async function sqlFor() {
  return (await readyDb()) ? bgDb() : null;
}

export async function getSyncState(): Promise<SyncState | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [row] = await sql`select value from app_settings where key = ${STATE_KEY}`;
  try { return row ? (JSON.parse(row.value) as SyncState) : null; } catch { return null; }
}

/** Only one sync at a time. The lock expires on its own after 90 seconds in case a run was cut off. */
async function tryLock(): Promise<boolean> {
  const sql = await sqlFor();
  if (!sql) return false;
  const now = Date.now();
  const rows = await sql`
    insert into app_settings (key, value) values (${LOCK_KEY}, ${String(now)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
      where app_settings.value::bigint < ${now - 90_000}
    returning key`;
  return rows.length > 0;
}

export async function syncLeads(gmail: GmailClient, { timeLimitMs = 20_000 } = {}): Promise<SyncState | { busy: true }> {
  const sql = await sqlFor();
  if (!sql) return { busy: true };
  if (!(await tryLock())) return { busy: true };
  // One-time: customer rows for leads saved before they existed (skips instantly once done).
  await ensureCustomersBuilt(sql).catch(() => undefined);
  const deadline = Date.now() + timeLimitMs;
  const previous = await getSyncState();
  const backfill = previous?.backfill ?? { token: null, done: false, estimate: 0 };
  let added = 0;
  let failed = 0;

  // Saves run one at a time (reading from Gmail stays parallel) so two emails from the same person can't collide.
  let saving: Promise<unknown> = Promise.resolve();
  const save = (work: () => Promise<unknown>) => (saving = saving.then(work, work));

  /** Reads and saves the emails in `ids` that aren't saved yet. Returns false if it ran out of time. */
  async function importIds(ids: string[]): Promise<boolean> {
    const known = await knownMessageIds(ids, sql!);
    const missing = ids.filter((id) => !known.has(id));
    let finished = true;
    await mapLimit(missing, 5, async (id) => {
      if (Date.now() >= deadline) { finished = false; return; }
      try {
        const lead = await readLead(gmail, id);
        await save(async () => {
          if (lead) { if (await saveLead(lead, sql!)) added++; }
          else await markIgnored(id, 0, "", sql!);
        });
      } catch (error) {
        failed++;
        finished = false;
        console.error("Lead sync skipped a message:", error instanceof Error ? error.message : "unknown");
      }
    });
    await saving;
    return finished;
  }

  try {
    // 1. Anything new since the newest saved lead (two days of overlap catches late arrivals).
    const [{ newest }] = await sql`select max(received_at) as newest from leads`;
    if (newest) {
      const after = Math.floor(new Date(newest).getTime() / 1000) - 2 * 86400;
      let token: string | undefined;
      for (let page = 0; page < 5 && Date.now() < deadline; page++) {
        const result = await gmail.listPage(`${LEAD_QUERIES.all} after:${after}`, PAGE, token);
        await importIds(result.ids);
        if (!result.next) break;
        token = result.next;
      }
    }

    // 1b. Lead types added later (Westlake pre-qualifications): look back to the data start once, so none are missed.
    const [catchup] = await sql`select value from app_settings where key = 'catchup_prequal'`;
    if (!catchup && Date.now() < deadline - 3000) {
      const since = Math.floor(dataStartDate().getTime() / 1000);
      const result = await gmail.listPage(`(subject:"pre-qualification" OR subject:prequalification) -in:sent -in:drafts after:${since}`, PAGE);
      if (await importIds(result.ids)) {
        await sql`insert into app_settings (key, value) values ('catchup_prequal', 'done') on conflict (key) do update set value = 'done'`;
      }
    }

    // 1c. Repairs for leads saved before the parser learned CarsForSale's newer email layout: loan applications with a
    //     missing or wrong applicant name, and website leads with no car. Re-reads those emails and fixes the rows.
    //     Only touches bad rows, so once they're fixed it costs one small query.
    if (Date.now() < deadline - 3000) {
      const bad = await sql`select message_id, kind from leads
        where not ignored and received_at >= now() - interval '120 days'
          and ((kind = 'application' and (name is null or name = '' or name ~* '^(vehicle information|finance application|you have a new|year\\s*:|make\\s*:)'))
            or (provider ilike '%carsforsale%' and vehicle is null))
        order by received_at desc limit 80`;
      // Emails that can't be fixed (no name or car in them) are remembered, so they aren't re-read every 5 minutes.
      const [gaveUpRow] = await sql`select value from app_settings where key = 'lead_repair_gave_up'`;
      let gaveUp: string[] = [];
      try { gaveUp = gaveUpRow ? JSON.parse(gaveUpRow.value) : []; } catch { /* start over */ }
      let gaveUpChanged = false;
      let fixed = 0;
      for (const row of bad.filter((r) => !gaveUp.includes(r.message_id)).slice(0, 30)) {
        if (Date.now() >= deadline - 2000) break;
        try {
          const lead = await readLead(gmail, row.message_id);
          const goodName = Boolean(lead?.name) && !/^(vehicle information|finance application)/i.test(lead!.name!);
          const useful = row.kind === "application" ? goodName : Boolean(lead?.vehicle);
          if (lead && useful) {
            await sql`update leads set name = ${goodName ? lead.name : null}, phone = coalesce(${lead.phone}, phone), email = coalesce(${lead.email}, email),
              location = coalesce(${lead.location}, location), vehicle = coalesce(${lead.vehicle}, vehicle), stock = coalesce(${lead.stock}, stock)
              where message_id = ${row.message_id}`;
            fixed++;
          } else {
            gaveUp = [...gaveUp, row.message_id].slice(-400);
            gaveUpChanged = true;
          }
        } catch (error) {
          console.error("Couldn't re-read a lead email to repair it:", error instanceof Error ? error.message : "unknown");
        }
      }
      if (gaveUpChanged) {
        await sql`insert into app_settings (key, value) values ('lead_repair_gave_up', ${JSON.stringify(gaveUp)})
          on conflict (key) do update set value = excluded.value, updated_at = now()`.catch(() => undefined);
      }
      if (fixed) {
        await rebuildCustomers(sql).catch((e) => console.error("Customer rebuild after lead repair failed:", e instanceof Error ? e.message : e));
        console.log(`Repaired ${fixed} lead(s) (applicant name or car).`);
      }
    }

    // 2. First-time import of the last 12 months, one page at a time, continuing where the last run stopped.
    while (!backfill.done && Date.now() < deadline - 2000) {
      const result = await gmail.listPage(`${LEAD_QUERIES.all} ${HISTORY}`, PAGE, backfill.token ?? undefined);
      if (!backfill.token && result.estimate) backfill.estimate = result.estimate;
      if (!(await importIds(result.ids))) break; // out of time: redo this page next run (saved ones are skipped)
      if (result.next) backfill.token = result.next;
      else backfill.done = true;
    }
  } catch (error) {
    // A stale page marker restarts the walk from the newest email; already-saved emails are skipped cheaply.
    if (String((error as Error)?.message ?? "").includes("400")) backfill.token = null;
    failed++;
    console.error("Lead sync stopped early:", error instanceof Error ? error.message : "unknown");
  } finally {
    const [{ saved, checked }] = await sql`
      select count(*) filter (where not ignored)::int as saved, count(*) filter (where received_at > now() - interval '365 days')::int as checked
      from leads`.catch(() => [{ saved: previous?.saved ?? 0, checked: 0 }]);
    const state: SyncState = {
      lastRun: Date.now(),
      saved,
      remaining: backfill.done ? 0 : Math.max(1, backfill.estimate - checked),
      failed,
      added,
      backfill,
    };
    await sql`insert into app_settings (key, value) values (${STATE_KEY}, ${JSON.stringify(state)})
      on conflict (key) do update set value = excluded.value, updated_at = now()`.catch(() => undefined);
    await sql`delete from app_settings where key = ${LOCK_KEY}`.catch(() => undefined);
  }
  return (await getSyncState()) ?? { lastRun: Date.now(), saved: 0, remaining: 0, failed, added };
}
