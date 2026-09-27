// Copies new lead emails from Gmail into the leads table. Each email is read once, ever.
// First run imports the last 12 months in batches; after that, each run only reads what's new.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { LEAD_QUERIES, mapLimit, readLead, type GmailClient } from "@/lib/gmail";
import { knownMessageIds, markIgnored, saveLead, savedLeadCount } from "./store";

export const HISTORY = "newer_than:365d";
const STATE_KEY = "lead_sync_state";
const LOCK_KEY = "lead_sync_lock";

export type SyncState = { lastRun: number; saved: number; remaining: number; failed: number; added?: number };

export async function getSyncState(): Promise<SyncState | null> {
  const raw = await getSetting(STATE_KEY).catch(() => null);
  try { return raw ? (JSON.parse(raw) as SyncState) : null; } catch { return null; }
}

/** Only one sync at a time. The lock expires on its own after 2 minutes in case a run was cut off. */
async function tryLock(): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  const now = Date.now();
  const rows = await sql`
    insert into app_settings (key, value) values (${LOCK_KEY}, ${String(now)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
      where app_settings.value::bigint < ${now - 120_000}
    returning key`;
  return rows.length > 0;
}

async function unlock() {
  await setSetting(LOCK_KEY, null).catch(() => undefined);
}

/**
 * Reads up to `budget` new lead emails (newest first) and saves them, stopping after `timeLimitMs`
 * so a run always finishes well inside Vercel's time limit and records its progress.
 * Listing message IDs is cheap, so it always checks the full 12 months for anything missing.
 */
export async function syncLeads(
  gmail: GmailClient,
  { budget = 150, timeLimitMs = 35_000 } = {},
): Promise<SyncState | { busy: true }> {
  if (!(await tryLock())) return { busy: true };
  const deadline = Date.now() + timeLimitMs;
  let missingCount = 0;
  let done = 0;
  let failed = 0;
  let added = 0;
  try {
    const ids: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 40; page++) {
      const result = await gmail.listPage(`${LEAD_QUERIES.all} ${HISTORY}`, 500, token);
      ids.push(...result.ids);
      if (!result.next || Date.now() >= deadline) break;
      token = result.next;
    }
    const known = await knownMessageIds(ids);
    const missing = ids.filter((id) => !known.has(id));
    missingCount = missing.length;
    const batch = missing.slice(0, budget);

    await mapLimit(batch, 5, async (id) => {
      if (Date.now() >= deadline) return; // out of time: leave the rest for the next run
      try {
        const lead = await readLead(gmail, id);
        if (lead) { await saveLead(lead); added++; }
        else await markIgnored(id, 0, "");
        done++;
      } catch (error) {
        failed++;
        console.error("Lead sync skipped a message:", error instanceof Error ? error.message : "unknown");
      }
    });
  } finally {
    // Always record progress, even if the run was cut short or failed part-way.
    const state: SyncState = {
      lastRun: Date.now(),
      saved: await savedLeadCount().catch(() => 0),
      remaining: Math.max(0, missingCount - done),
      failed,
      added,
    };
    await setSetting(STATE_KEY, JSON.stringify(state)).catch(() => undefined);
    await unlock();
  }
  return (await getSyncState()) ?? { lastRun: Date.now(), saved: 0, remaining: 0, failed, added };
}
