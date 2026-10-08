// Which website page worked and which didn't, run after run, so the failing page can be spotted. Pure (no imports).

export type Attempt = { page: number; route: "direct" | "helper"; ok: boolean; note: string };
export type PageStat = { ok: number; fail: number; lastOkAt: number | null; lastFailAt: number | null; lastError: string | null; routes: { direct: [number, number]; helper: [number, number] } };
export type PageStats = Record<string, PageStat>;

/** Adds one run's attempts to the running totals. A page counts as "worked" for the run if any route worked. */
export function foldAttempts(stats: PageStats, attempts: Attempt[], now: number): PageStats {
  const next: PageStats = JSON.parse(JSON.stringify(stats));
  const pages = new Set(attempts.map((a) => a.page));
  for (const page of pages) {
    const mine = attempts.filter((a) => a.page === page);
    const s = next[page] ?? { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null, lastError: null, routes: { direct: [0, 0], helper: [0, 0] } };
    for (const a of mine) s.routes[a.route][a.ok ? 0 : 1]++;
    if (mine.some((a) => a.ok)) { s.ok++; s.lastOkAt = now; }
    else { s.fail++; s.lastFailAt = now; s.lastError = mine.map((a) => `${a.route}: ${a.note}`).join("; ").slice(0, 300); }
    next[page] = s;
  }
  // Keeps the table small: only pages 1 to 40.
  for (const key of Object.keys(next)) if (Number(key) > 40) delete next[key];
  return next;
}
