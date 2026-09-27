// Decides where a page gets its leads: the saved-leads table (fast) when the database is ready,
// otherwise straight from Gmail. Returns the same shape either way so pages don't care.
import { dbState } from "@/lib/db";
import type { GmailResult, Lead, LeadFilter } from "@/lib/gmail";
import { fetchLeads, fetchManyLeads, withGmail } from "@/lib/gmail";
import { getGmailConnection } from "@/lib/gmail/connection";
import { syncInBackground } from "./background";
import { allLeads, queryLeads, savedLeadCount } from "./store";
import { getSyncState, type SyncState } from "./sync";

export type SyncInfo = { lastRun: number | null; saved: number; remaining: number } | null;
type Loaded<T> = (GmailResult<T> | { status: "ok"; data: T; gmail?: undefined }) & { sync: SyncInfo };

async function fromDb<T>(load: () => Promise<T>, isEmpty: (t: T) => boolean): Promise<Loaded<T> | null> {
  if ((await dbState()) !== "ready") return null;
  const connection = await getGmailConnection().catch(() => null);
  const [data, state, saved] = await Promise.all([load(), getSyncState(), savedLeadCount()]);
  if (!connection && isEmpty(data)) return { status: "not_connected", sync: null };
  if (connection) await syncInBackground();
  const sync = connection ? { lastRun: (state as SyncState | null)?.lastRun ?? null, saved, remaining: state?.remaining ?? 0 } : null;
  return { status: "ok", data, sync };
}

/** One page of leads for the Leads and Credit Applications pages. */
export async function loadLeadPage(opts: { filter: LeadFilter; search: string; page: number; gmailToken?: string }) {
  const perPage = 50;
  const db = await fromDb(
    () => queryLeads({ filter: opts.filter, search: opts.search, limit: perPage, offset: opts.page * perPage }),
    (d) => d.leads.length === 0,
  );
  if (db) return { ...db, mode: "db" as const };
  const gmail = await withGmail((g) => fetchLeads(g, { filter: opts.filter, extra: opts.search, pageToken: opts.gmailToken }));
  return { ...gmail, sync: null, mode: "gmail" as const };
}

/** Every lead (optionally since a date) for Customers and Analytics. */
export async function loadAllLeads(opts: { since?: Date; gmailLimit: number; gmailExtra?: string }) {
  const db = await fromDb(async () => ({ leads: await allLeads(opts.since), more: false, skipped: 0 }), (d) => d.leads.length === 0);
  if (db) return { ...db, mode: "db" as const };
  const gmail = await withGmail((g) => fetchManyLeads(g, { limit: opts.gmailLimit, extra: opts.gmailExtra }));
  return { ...gmail, sync: null, mode: "gmail" as const };
}

export type { Lead };
