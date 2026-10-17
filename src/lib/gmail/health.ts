// Remembers whether the dealership Gmail works. The timer checks it every 5 minutes. When it breaks, a red bar shows for the people
// who can fix it and the developer gets an email (not through Gmail, which is what broke): once, then again every 12 hours.
import { getSetting, setSetting } from "@/lib/db/data";
import { developerEmailReady, emailDeveloper } from "@/lib/notify/developer-email";
import { nextHealth, shouldAlert, type GmailHealth } from "./health-rules";

const KEY = "gmail_health";

export async function getGmailHealth(): Promise<GmailHealth | null> {
  try { const raw = await getSetting(KEY); return raw ? (JSON.parse(raw) as GmailHealth) : null; } catch { return null; }
}

export async function clearGmailHealth() {
  await setSetting(KEY, null).catch(() => undefined);
}

/** Saves the result of a Gmail check and, if it just broke (or is still broken after 12 hours), emails the developer. */
export async function recordGmailCheck(check: { ok: boolean; code?: string | null; message?: string | null }): Promise<void> {
  try {
    const now = Date.now();
    const health = nextHealth(await getGmailHealth(), check, now);
    if (!health.ok && shouldAlert(health, now) && developerEmailReady()) {
      const base = (process.env.APP_URL || "https://auto-one-dealer.vercel.app").replace(/\/$/, "");
      const since = health.since ? new Date(health.since).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) : "just now";
      const sent = await emailDeveloper(
        "AutoDash: the dealership Gmail stopped working",
        `The dealership Gmail connection is not working (since ${since}). Lead emails are NOT being read or answered. Texts still work.\n\nWhat Google said: ${health.message}\nCode: ${health.code ?? "none"}\n\nFix: open ${base}/settings and click Reconnect Gmail. If it keeps happening every 7 days, publish the Google OAuth app to "In production" in Google Cloud.\n\nThis email repeats every 12 hours until it is fixed.`,
      );
      if (sent.ok) health.alertedAt = now;
      else console.error("[autodash:gmail] couldn't email the developer:", sent.error);
    }
    await setSetting(KEY, JSON.stringify(health));
  } catch { /* the warning is best effort; the timer carries on */ }
}
