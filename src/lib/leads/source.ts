// Where the Leads and Credit Applications pages get their leads: the saved-leads table (fast) when the
// database is ready, otherwise straight from Gmail. Returns the same shape either way.
import { dbState } from "@/lib/db";
import type { GmailResult, Lead, LeadFilter } from "@/lib/gmail";
import { fetchLeads, withGmail } from "@/lib/gmail";
import { getGmailConnection } from "@/lib/gmail/connection";
import { queryLeads } from "./store";
import { getSyncState } from "./sync";

export type SyncInfo = { lastRun: number | null; saved: number; remaining: number } | null;

/** How fresh the saved leads are. One tiny query. */
export async function syncInfo(): Promise<SyncInfo> {
  const state = await getSyncState().catch(() => null);
  return state ? { lastRun: state.lastRun, saved: state.saved, remaining: state.remaining } : { lastRun: null, saved: 0, remaining: 1 };
}

type Loaded = (GmailResult<{ leads: Lead[]; more: boolean }> | { status: "ok"; data: { leads: Lead[]; more: boolean }; gmail?: undefined }) & { sync: SyncInfo };

/** One page of leads for the Leads and Credit Applications pages. */
export async function loadLeadPage(opts: { filter: LeadFilter; search: string; page: number; gmailToken?: string }) {
  const perPage = 50;
  if ((await dbState()) === "ready") {
    const [data, sync] = await Promise.all([
      queryLeads({ filter: opts.filter, search: opts.search, limit: perPage, offset: opts.page * perPage }),
      syncInfo(),
    ]);
    // Only an empty list needs to know whether Gmail is connected at all.
    if (data.leads.length === 0 && !opts.search && !(await getGmailConnection().catch(() => null))) {
      return { status: "not_connected" as const, sync: null, mode: "db" as const } as Loaded & { mode: "db" };
    }
    return { status: "ok" as const, data, sync, mode: "db" as const };
  }
  const gmail = await withGmail((g) => fetchLeads(g, { filter: opts.filter, extra: opts.search, pageToken: opts.gmailToken }));
  return { ...gmail, sync: null, mode: "gmail" as const };
}

export type { Lead };
