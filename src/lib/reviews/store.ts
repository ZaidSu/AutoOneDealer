// Customer reviews: read from Google Business Profile's review emails in the dealership inbox, plus any added by hand.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { readableBody, withGmail } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";
import { cached, dropCached } from "@/lib/utils/cache";
import { dayKey } from "@/lib/utils/time";
import { parseReviewEmail } from "./parse";

const LAST_KEY = "reviews_last_sync";
const REMOVALS_KEY = "reviews_removals";
const GOOGLE_KEY = "reviews_google_profile";
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
    let removals: { name: string; at: number }[] = [];
    try { removals = JSON.parse((await getSetting(REMOVALS_KEY)) ?? "[]"); } catch { /* start fresh */ }
    let added = 0, scanned = 0;
    for (const id of ids) {
      if (known.has(id)) continue;
      scanned++;
      const m = await gmail.full(id);
      const parsed = parseReviewEmail(m.subject, m.text || readableBody(m));
      if (!parsed) continue;
      if (parsed.kind === "removed") {
        // Applied below, once every review in this batch is saved (the newest emails are read first, so a removal can arrive before the review it removes).
        if (parsed.reviewer) removals.push({ name: parsed.reviewer, at: m.receivedAt || Date.now() });
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
    // Reviews Google removed: taken out of the numbers. Remembered, and applied every run, so the order the emails arrive in doesn't matter.
    const seen = new Set<string>();
    removals = removals.filter((r) => { const k = `${r.name.toLowerCase()}|${r.at}`; return seen.has(k) ? false : (seen.add(k), true); }).slice(-60);
    await setSetting(REMOVALS_KEY, JSON.stringify(removals)).catch(() => undefined);
    let removed = 0;
    for (const r of removals) {
      const rows = await sql`update reviews set status = 'removed' where status = 'active' and source = 'Google' and reviewed_at <= ${new Date(r.at)}
        and (lower(reviewer) = lower(${r.name}) or lower(reviewer) like lower(${r.name}) || ' %') returning id`;
      removed += rows.length;
    }
    return { added, removed, scanned };
  }, connection, "background");
  if (result.status === "ok" && (result.data.added || result.data.removed)) dropCached("reviews:");
  if (result.status !== "ok") return { error: result.status === "error" ? result.message : "Gmail isn't connected" };
  await setSetting(LAST_KEY, String(Date.now())).catch(() => undefined);
  return result.data;
}

export async function addReview(input: { source: string; reviewer: string; rating: number; text: string; reviewedOn: Date }, by: string) {
  dropCached("reviews:");
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`insert into reviews (id, source, reviewer, rating, body, reviewed_at, added_by) values (${`manual-${Date.now()}`}, ${input.source}, ${input.reviewer || null}, ${input.rating}, ${input.text || null}, ${input.reviewedOn}, ${by})`;
}

export async function removeReview(id: string) {
  dropCached("reviews:");
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
  /** What Google's own page says (typed in by staff), since Google doesn't email about every review. */
  google: { total: number; rating: number | null; at: number } | null;
};

export async function setGoogleProfile(total: number, rating: number | null) {
  dropCached("reviews:");
  await setSetting(GOOGLE_KEY, JSON.stringify({ total, rating, at: Date.now() }));
}

export function reviewStats(timeZone = dealership.timeZone): Promise<ReviewStats | null> {
  return cached(`reviews:stats:${timeZone}`, 30_000, () => computeReviewStats(timeZone));
}

async function computeReviewStats(timeZone: string): Promise<ReviewStats | null> {
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
  let google: ReviewStats["google"] = null;
  try { const raw = await getSetting(GOOGLE_KEY); if (raw) google = JSON.parse(raw); } catch { /* none saved */ }
  return {
    total: t.total, avg: t.avg, fiveStar: t.five, unrated: t.unrated,
    thisMonth: { n: find(thisKey)?.n ?? 0, avg: find(thisKey)?.avg ?? null }, lastMonth: { n: find(lastKey)?.n ?? 0 },
    byMonth, bySource: sources.map((r) => ({ source: r.source as string, n: r.n as number, avg: (r.avg as number) ?? null })),
    recent: recent.map((r) => ({ id: r.id, source: r.source, reviewer: r.reviewer ?? null, rating: r.rating ?? null, body: r.body ?? null, link: r.link ?? null, at: new Date(r.reviewed_at).getTime() })),
    since: t.since ? new Date(t.since).getTime() : null, lastSync, google,
  };
}

/** Just what the Overview needs: this month's reviews, last month's, and the average. One small query. */
export function reviewSummary(timeZone = dealership.timeZone): Promise<{ thisMonth: number; lastMonth: number; avg: number | null; total: number; google: ReviewStats["google"] }> {
  return cached(`reviews:summary:${timeZone}`, 30_000, async () => {
    const sql = await readyDb();
    let google: ReviewStats["google"] = null;
    try { const raw = await getSetting(GOOGLE_KEY); if (raw) google = JSON.parse(raw); } catch { /* none saved */ }
    if (!sql) return { thisMonth: 0, lastMonth: 0, avg: null, total: 0, google };
    const thisKey = dayKey(Date.now(), timeZone).slice(0, 7);
    const [y, mo] = thisKey.split("-").map(Number);
    const lastKey = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
    const [r] = await sql`select count(*) filter (where to_char(reviewed_at at time zone ${timeZone}, 'YYYY-MM') = ${thisKey})::int as this_month,
        count(*) filter (where to_char(reviewed_at at time zone ${timeZone}, 'YYYY-MM') = ${lastKey})::int as last_month, avg(rating)::float8 as avg, count(*)::int as total
        from reviews where status = 'active'`;
    return { thisMonth: r.this_month as number, lastMonth: r.last_month as number, avg: (r.avg as number) ?? null, total: r.total as number, google };
  });
}
