// Customer reviews: read from Google Business Profile's review emails in the dealership inbox, plus any added by hand.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { readableBody, withGmail } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";
import { dayKey } from "@/lib/utils/time";
import { parseReviewEmail } from "./parse";

const LAST_KEY = "reviews_last_sync";
const REMOVED_KEY = "reviews_removed_seen";
const SEARCH = `from:businessprofile-noreply@google.com (subject:"left a review" OR subject:"new review" OR subject:"new reviews" OR subject:"review has been removed")`;

export type ReviewSyncResult = { skipped?: string; added?: number; removed?: number; scanned?: number; error?: string };

/** Looks for new review emails (at most every 30 minutes; the first time it reads all of them). */
export async function syncReviews(opts: { force?: boolean } = {}): Promise<ReviewSyncResult> {
  const sql = await readyDb();
  if (!sql) return { skipped: "no database" };
  const last = Number(await getSetting(LAST_KEY).catch(() => 0)) || 0;
  if (!opts.force && Date.now() - last < 30 * 60_000) return { skipped: "checked recently" };
  const connection = await loadGmailConnection(undefined);
  if (!connection) return { skipped: "Gmail isn't connected" };

  const result = await withGmail(async (gmail) => {
    const ids = await gmail.listIds(`${SEARCH}${last ? " newer_than:30d" : ""}`, 100);
    const known = new Set((ids.length ? await sql`select distinct gmail_id from reviews where gmail_id = any(${ids})` : []).map((r) => r.gmail_id as string));
    let removedSeen: string[] = [];
    try { removedSeen = JSON.parse((await getSetting(REMOVED_KEY)) ?? "[]"); } catch { /* start fresh */ }
    let added = 0, removed = 0, scanned = 0;
    for (const id of ids) {
      if (known.has(id) || removedSeen.includes(id)) continue;
      scanned++;
      const m = await gmail.full(id);
      const parsed = parseReviewEmail(m.subject, m.text || readableBody(m));
      if (!parsed) continue;
      if (parsed.kind === "removed") {
        if (parsed.reviewer) {
          const rows = await sql`update reviews set status = 'removed' where status = 'active' and source = 'Google'
            and (lower(reviewer) = lower(${parsed.reviewer}) or lower(reviewer) like lower(${parsed.reviewer}) || ' %') returning id`;
          removed += rows.length;
        }
        removedSeen = [...removedSeen, id].slice(-60);
        continue;
      }
      for (const [n, r] of parsed.reviews.entries()) {
        const rows = await sql`insert into reviews (id, source, reviewer, rating, body, link, reviewed_at, gmail_id)
          values (${r.reviewId ?? `gm-${id}-${n}`}, 'Google', ${r.reviewer}, ${r.rating}, ${r.text}, ${r.link}, ${new Date(m.receivedAt || Date.now())}, ${id})
          on conflict (id) do update set rating = coalesce(reviews.rating, excluded.rating), body = coalesce(nullif(reviews.body, ''), excluded.body), link = coalesce(reviews.link, excluded.link)
          returning (xmax = 0) as inserted`;
        if (rows[0]?.inserted) added++;
      }
    }
    await setSetting(REMOVED_KEY, JSON.stringify(removedSeen)).catch(() => undefined);
    return { added, removed, scanned };
  }, connection, "background");
  if (result.status !== "ok") return { error: result.status === "error" ? result.message : "Gmail isn't connected" };
  await setSetting(LAST_KEY, String(Date.now())).catch(() => undefined);
  return result.data;
}

export async function addReview(input: { source: string; reviewer: string; rating: number; text: string; reviewedOn: Date }, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`insert into reviews (id, source, reviewer, rating, body, reviewed_at, added_by) values (${`manual-${Date.now()}`}, ${input.source}, ${input.reviewer || null}, ${input.rating}, ${input.text || null}, ${input.reviewedOn}, ${by})`;
}

export async function removeReview(id: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update reviews set status = 'removed' where id = ${id}`;
}

export type ReviewRow = { id: string; source: string; reviewer: string | null; rating: number | null; body: string | null; link: string | null; at: number };
export type ReviewStats = {
  total: number; avg: number | null; fiveStar: number; unrated: number;
  thisMonth: { n: number; avg: number | null }; lastMonth: { n: number };
  byMonth: { month: string; n: number }[]; bySource: { source: string; n: number; avg: number | null }[];
  recent: ReviewRow[]; since: number | null; lastSync: number | null;
};

export async function reviewStats(timeZone = dealership.timeZone): Promise<ReviewStats | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [[t], months, sources, recent] = await Promise.all([
    sql`select count(*)::int as total, avg(rating)::float8 as avg, count(*) filter (where rating = 5)::int as five, count(*) filter (where rating is null)::int as unrated, min(reviewed_at) as since
        from reviews where status = 'active'`,
    sql`select to_char(reviewed_at at time zone ${timeZone}, 'YYYY-MM') as m, count(*)::int as n, avg(rating)::float8 as avg from reviews where status = 'active' group by 1 order by 1 desc limit 12`,
    sql`select source, count(*)::int as n, avg(rating)::float8 as avg from reviews where status = 'active' group by 1 order by n desc`,
    sql`select id, source, reviewer, rating, body, link, reviewed_at from reviews where status = 'active' order by reviewed_at desc limit 8`,
  ]);
  const thisKey = dayKey(Date.now(), timeZone).slice(0, 7);
  const [y, mo] = thisKey.split("-").map(Number);
  const lastKey = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const find = (k: string) => months.find((r) => r.m === k);
  // The last 6 months including empty ones, oldest first.
  const byMonth: { month: string; n: number }[] = [];
  for (let i = 5; i >= 0; i--) { const k = new Date(Date.UTC(y, mo - 1 - i, 1)).toISOString().slice(0, 7); byMonth.push({ month: k, n: find(k)?.n ?? 0 }); }
  const lastSync = Number(await getSetting(LAST_KEY).catch(() => 0)) || null;
  return {
    total: t.total, avg: t.avg, fiveStar: t.five, unrated: t.unrated,
    thisMonth: { n: find(thisKey)?.n ?? 0, avg: find(thisKey)?.avg ?? null }, lastMonth: { n: find(lastKey)?.n ?? 0 },
    byMonth, bySource: sources.map((r) => ({ source: r.source as string, n: r.n as number, avg: (r.avg as number) ?? null })),
    recent: recent.map((r) => ({ id: r.id, source: r.source, reviewer: r.reviewer ?? null, rating: r.rating ?? null, body: r.body ?? null, link: r.link ?? null, at: new Date(r.reviewed_at).getTime() })),
    since: t.since ? new Date(t.since).getTime() : null, lastSync,
  };
}
