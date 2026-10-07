// Where the dealership Gmail connection lives: the shared database when connected (every device sees it),
// otherwise an encrypted cookie in the browser that connected it. Both are encrypted with SESSION_SECRET.
import { cookies } from "next/headers";
import { sessionSecret } from "@/lib/auth/config";
import { seal } from "@/lib/auth/crypto";
import { GMAIL_COOKIE, readSealed, type GmailConnection } from "@/lib/auth/session";
import { getSetting, setSetting } from "@/lib/db/data";

const KEY = "gmail_connection";

// The shared connection rarely changes, so remember it briefly instead of asking the database on every page.
let cached: { value: GmailConnection | null; at: number } | null = null;

export async function loadGmailConnection(cookieValue: string | undefined): Promise<GmailConnection | null> {
  if (cached?.value && Date.now() - cached.at < 60_000) return cached.value;
  const shared = await getSetting(KEY).catch(() => null);
  const fromDb = shared ? readSealed<GmailConnection>(shared) : null;
  if (fromDb) {
    cached = { value: fromDb, at: Date.now() };
    return fromDb;
  }
  const fromCookie = readSealed<GmailConnection>(cookieValue);
  // A browser still holding the old per-browser connection shares it with the team automatically.
  if (fromCookie) void saveSharedGmailConnection(fromCookie);
  return fromCookie;
}

/** For Server Components. */
export async function getGmailConnection(): Promise<GmailConnection | null> {
  const jar = await cookies();
  return loadGmailConnection(jar.get(GMAIL_COOKIE)?.value);
}

export async function saveSharedGmailConnection(connection: GmailConnection) {
  cached = { value: connection, at: Date.now() };
  await setSetting(KEY, seal(connection, sessionSecret())).catch((e) => console.error("Couldn't save Gmail connection to database:", e?.message));
}

export async function clearSharedGmailConnection() {
  cached = null;
  await setSetting(KEY, null).catch(() => undefined);
}
