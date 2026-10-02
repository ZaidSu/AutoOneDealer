import { Columns, Panel, Stat } from "@/components/analytics/Charts";
import { AddReview, GoogleNumbers, RemoveReview } from "@/components/analytics/AddReview";
import type { ReviewStats } from "@/lib/reviews/store";

const stars = (n: number | null) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "no stars");
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

/** Reviews: how many came in this month, the average rating, and the latest ones. */
export default function ReviewsSection({ stats }: { stats: ReviewStats | null }) {
  const s = stats;
  const delta = s ? s.thisMonth.n - s.lastMonth.n : 0;
  const deltaText = !s ? "" : s.lastMonth.n === 0 && s.thisMonth.n === 0 ? "none last month either" : delta === 0 ? `same as last month (${s.lastMonth.n})` : `${delta > 0 ? "+" : ""}${delta} vs last month (${s.lastMonth.n})`;
  return (
    <section aria-labelledby="reviews" className="mb-6 max-w-5xl">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews" className="text-lg font-semibold">Reviews</h2>
        <AddReview />
      </div>
      {!s ? <p className="panel p-5 text-muted">Reviews will show here once the database is connected.</p> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat value={s.thisMonth.n} label="Reviews this month" sub={deltaText} color="#f08c00" />
            <Stat value={s.google?.rating ? s.google.rating.toFixed(1) : s.avg ? s.avg.toFixed(1) : "n/a"} label="Average rating"
              sub={s.google?.rating ? `on Google (${s.avg ? s.avg.toFixed(1) : "n/a"} from the ${s.total - s.unrated} listed here)` : s.avg ? `${stars(Math.round(s.avg))} from ${s.total - s.unrated} rated` : "no ratings yet"} color="#f59f00" />
            <Stat value={s.fiveStar} label="5-star reviews" sub={s.total ? `${Math.round((s.fiveStar / s.total) * 100)}% of the ${s.total} listed here` : "none yet"} color="#0ca678" />
            <Stat value={s.google ? s.google.total : s.total} label="Reviews in total"
              sub={s.google ? `on Google, as you entered ${day(s.google.at)}. ${s.total} are listed here` : s.since ? `listed here, since ${day(s.since)}` : "none yet"} color="#1c7ed6" />
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <Panel title="Reviews per month" note="The last 6 months. This month is in red.">
              <Columns items={s.byMonth.map((m) => ({ label: monthName(m.month), value: m.n }))} color="#f59f00" highlightLast emptyText="No reviews yet." />
            </Panel>
            <Panel title="Latest reviews" note={s.bySource.length > 1 ? s.bySource.map((x) => `${x.source} ${x.n}`).join(" · ") : "Google reviews, from the emails Google sends you."}>
              {s.recent.length === 0 ? <p className="px-5 pb-5 text-muted">No reviews yet.</p> : (
                <ul className="divide-y divide-line px-5 pb-2">
                  {s.recent.map((r) => (
                    <li key={r.id} className="py-3">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{r.reviewer || "Someone"}</span>
                        <span aria-label={r.rating ? `${r.rating} stars` : "no star rating"} className="text-[#f59f00]">{stars(r.rating)}</span>
                        <span className="text-sm text-muted">{r.source} · {day(r.at)}</span>
                      </p>
                      {r.body && <p className="mt-0.5 text-[15px]">{r.body}</p>}
                      <p className="mt-1 flex gap-3 text-sm">
                        {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-signal underline">Reply on Google</a>}
                        <RemoveReview id={r.id} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <GoogleNumbers total={s.google?.total ?? null} rating={s.google?.rating ?? null} />
          <p className="mt-3 text-sm text-muted">
            {s.google && s.google.total > s.total ? `Google shows ${s.google.total - s.total} more review${s.google.total - s.total === 1 ? "" : "s"} than are listed here. Google doesn't email about every review. ` : ""}
            Google reviews are counted from the &ldquo;new review&rdquo; emails Google sends to the dealership inbox{s.since ? `, starting ${day(s.since)}` : ""}. A review Google never emailed about isn&apos;t counted, so use <b>Add a review</b> for older ones or ones on other sites (Cars.com, Facebook, DealerRater).
            {s.unrated > 0 ? ` ${s.unrated} didn't say how many stars (Google only gives a tally when several come in together), so they're left out of the average.` : ""}
          </p>
        </>
      )}
    </section>
  );
}
