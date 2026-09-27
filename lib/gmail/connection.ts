// Where the dealership Gmail connection lives: the shared database when connected (every device sees it),
// otherwise an encrypted cookie in the browser that connected it. Both are encrypted with SESSION_SECRET.
import { cookies } from "next/headers";
import { sessionSecret } from "@/lib/auth/config";
import { seal } from "@/lib/auth/crypto";
import { GMAIL_COOKIE, readSealed, type GmailConnection } from "@/lib/auth/session";
import { getSetting, setSetting } from "@/lib/db/data";

const KEY = "gmail_connection";

export async function loadGmailConnection(cookieValue: string | undefined): Promise<GmailConnection | null> {
  const shared = await getSetting(KEY).catch(() => null);
  const fromDb = shared ? readSealed<GmailConnection>(shared) : null;
  return fromDb ?? readSealed<GmailConnection>(cookieValue);
}

/** For Server Components. */
export async function getGmailConnection(): Promise<GmailConnection | null> {
  const jar = await cookies();
  return loadGmailConnection(jar.get(GMAIL_COOKIE)?.value);
}

export async function saveSharedGmailConnection(connection: GmailConnection) {
  await setSetting(KEY, seal(connection, sessionSecret())).catch((e) => console.error("Couldn't save Gmail connection to database:", e?.message));
}

export async function clearSharedGmailConnection() {
  await setSetting(KEY, null).catch(() => undefined);
}
