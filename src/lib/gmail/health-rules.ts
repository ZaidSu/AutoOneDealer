// What AutoDash remembers about whether the dealership Gmail is working, and when to warn. Pure (no imports) so it can be unit tested.
export type GmailHealth = { ok: boolean; at: number; /** When it first stopped working. */ since: number | null; code: string | null; message: string | null; alertedAt: number | null };

export const ALERT_EVERY_MS = 12 * 3600_000;

/** The new saved state after a check. Keeps the "since" time (and when we last warned) while it stays broken. */
export function nextHealth(prev: GmailHealth | null, check: { ok: boolean; code?: string | null; message?: string | null }, now: number): GmailHealth {
  if (check.ok) return { ok: true, at: now, since: null, code: null, message: null, alertedAt: null };
  return {
    ok: false, at: now, since: prev && !prev.ok ? prev.since ?? now : now,
    code: check.code ?? null, message: check.message ?? "Gmail isn't working.", alertedAt: prev && !prev.ok ? prev.alertedAt : null,
  };
}

/** Warn by text the first time it breaks, then again every 12 hours while it stays broken. */
export function shouldAlert(h: GmailHealth, now: number): boolean {
  return !h.ok && (h.alertedAt == null || now - h.alertedAt >= ALERT_EVERY_MS);
}

/** The words for the red bar on every page. */
export function bannerText(h: GmailHealth | null): string | null {
  if (!h || h.ok) return null;
  return h.message ?? "Gmail isn't working.";
}
