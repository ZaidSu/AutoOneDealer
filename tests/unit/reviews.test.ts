import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseReviewEmail } from "../../src/lib/reviews/parse.ts";

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), "utf8");

test("a single review email gives the reviewer, stars, comment, id and link", () => {
  const r = parseReviewEmail("Yohanes left a review for Auto One Motors", fx("review-single.txt"));
  assert.equal(r?.kind, "single");
  const [review] = (r as { reviews: ReturnType<typeof Object> & { reviewer: string }[] }).reviews as { reviewId: string; reviewer: string; rating: number; text: string; link: string }[];
  assert.equal(review.reviewer, "Yohanes Tesheme");
  assert.equal(review.rating, 5);
  assert.match(review.text, /^Steve was awesome gave me a huge discount/);
  assert.match(review.text, /best in north\.\.\.$/);
  assert.equal(review.reviewId, "Ci9DQUlRQUNvZENodHljRjlvT2pkVVNtRkxXVGRLYVdnM2VuTjBTREJJYW5KT1FrRRAB");
  assert.equal(review.link, "https://business.google.com/n/10201913360800326315/reviews/Ci9DQUlRQUNvZENodHljRjlvT2pkVVNtRkxXVGRLYVdnM2VuTjBTREJJYW5KT1FrRRAB?fid=17133235664781774992");
});

test("a 'you got 2 new reviews' email gives both reviews, and the stars when they are all the same", () => {
  const r = parseReviewEmail("Auto One Motors, you got 2 new reviews", fx("review-digest.txt")) as { kind: string; reviews: { reviewer: string; rating: number | null; text: string; reviewId: string | null }[] };
  assert.equal(r.kind, "digest");
  assert.deepEqual(r.reviews.map((x) => [x.reviewer, x.rating]), [["Junior Esquivel", 5], ["Sabra Osuma", 5]]);
  assert.match(r.reviews[0].text, /^The guys here were super friendly/);
  assert.equal(r.reviews[1].reviewId, "Ci9DQUlRQUNvZENodHljRjlvT21aa01UVndhSEJsT0VzeFpEUjBVa1JNV2xSdWJVRRAB");
});

test("mixed stars in a digest are left unknown instead of guessed", () => {
  const text = fx("review-digest.txt").replace("2 five-star reviews", "1 five-star review\n\n1 four-star review");
  const r = parseReviewEmail("Auto One Motors, you got 2 new reviews", text) as { reviews: { rating: number | null }[] };
  assert.deepEqual(r.reviews.map((x) => x.rating), [null, null]);
});

test("a removed review names who it was from; other emails are ignored", () => {
  const removed = parseReviewEmail("Auto One Motors – a review has been removed from your Business Profile",
    "A review has been removed from your Business Profile\n\nWe have removed this review from your Business Profile because it appeared to violate our policies.\n\nCraig\n\nIs this even a real business?");
  assert.deepEqual(removed, { kind: "removed", reviewer: "Craig" });
  assert.equal(parseReviewEmail("Auto One Motors, your performance report for August 2026", "930 people viewed"), null);
});
