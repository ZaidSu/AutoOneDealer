// Reads Google Business Profile review emails (from businessprofile-noreply@google.com). Pure logic, no imports, so it can be tested directly.
//   "Yohanes left a review for Auto One Motors"       -> one review, with its star rating
//   "Auto One Motors, you got 2 new reviews"          -> several reviews; the stars are only given as a tally ("2 five-star reviews")
//   "... a review has been removed from your Business Profile"
export type ParsedReview = { reviewId: string | null; reviewer: string; rating: number | null; text: string; link: string | null };
export type ParsedReviewEmail =
  | { kind: "single" | "digest"; reviews: ParsedReview[] }
  | { kind: "removed"; reviewer: string | null }
  | null;

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const isUrl = (l: string) => l.startsWith("<http") || l.startsWith("http");
const reviewIdIn = (s: string) => /\/reviews\/([A-Za-z0-9_-]{16,})/.exec(s)?.[1] ?? null;
/** The review's address without Google's tracking junk. */
const cleanLink = (s: string) => /https:\/\/business\.google\.com\/n\/\d+\/reviews(?:\/[A-Za-z0-9_-]+)?(?:\?fid=\d+)?/.exec(s)?.[0] ?? null;

export function parseReviewEmail(subject: string, text: string): ParsedReviewEmail {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const singleName = /^(.+?)\s+left a review for\b/i.exec(subject)?.[1]?.trim() ?? null;

  if (singleName) {
    const read = lines.findIndex((l) => /^Read review$/i.test(l));
    let i = read === -1 ? 0 : read + 1;
    while (i < lines.length && (!lines[i] || isUrl(lines[i]))) i++;
    const reviewer = read === -1 || !lines[i] || /^Reply to review$/i.test(lines[i]) ? singleName : lines[i];
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && !/^Reply to review$/i.test(lines[j]); j++) if (lines[j] && !isUrl(lines[j])) body.push(lines[j]);
    const stars = /new\s+(\d)-star review/i.exec(text)?.[1];
    return { kind: "single", reviews: [{ reviewId: reviewIdIn(text), reviewer, rating: stars ? Number(stars) : null, text: body.join(" "), link: cleanLink(text) }] };
  }

  if (/you got \d+ new reviews?/i.test(subject)) {
    const counts = new Map<number, number>();
    for (const m of text.matchAll(/(\d+)\s+(one|two|three|four|five)-star reviews?/gi)) counts.set(WORDS[m[2].toLowerCase()], (counts.get(WORDS[m[2].toLowerCase()]) ?? 0) + Number(m[1]));
    const start = lines.findIndex((l) => /let customers know when you.?ve replied/i.test(l));
    const reviews: ParsedReview[] = [];
    let i = start === -1 ? lines.length : start + 1;
    while (i < lines.length) {
      if (/^See all reviews$/i.test(lines[i])) break;
      if (!lines[i] || isUrl(lines[i])) { i++; continue; }
      const reviewer = lines[i++];
      const body: string[] = [];
      while (i < lines.length && !/^Reply to review$/i.test(lines[i]) && !/^See all reviews$/i.test(lines[i])) { if (lines[i] && !isUrl(lines[i])) body.push(lines[i]); i++; }
      let id: string | null = null, link: string | null = null;
      if (/^Reply to review$/i.test(lines[i] ?? "")) { i++; id = reviewIdIn(lines[i] ?? ""); link = cleanLink(lines[i] ?? ""); }
      reviews.push({ reviewId: id, reviewer, rating: null, text: body.join(" "), link });
    }
    // The stars are only given as a tally. If they're all the same rating, every review gets it; if mixed, they're left unknown.
    const only = counts.size === 1 ? [...counts.keys()][0] : null;
    if (only !== null && [...counts.values()][0] === reviews.length) for (const r of reviews) r.rating = only;
    return { kind: "digest", reviews };
  }

  if (/review has been removed/i.test(subject)) {
    const at = lines.findIndex((l) => /removed this review/i.test(l));
    let i = at === -1 ? lines.length : at + 1;
    while (i < lines.length && (!lines[i] || isUrl(lines[i]))) i++;
    return { kind: "removed", reviewer: lines[i] || null };
  }
  return null;
}
