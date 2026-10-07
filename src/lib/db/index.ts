// Shared Postgres connection (Supabase). Everything that needs saving goes through here.
// When DATABASE_URL isn't set, db() returns null and pages say the database isn't connected yet.
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
let client: Sql | null = null;
let readyCache: { value: boolean; at: number } | null = null;
let lastError: string | null = null;

/** The most recent database error, with addresses and passwords removed. */
export function lastDbError(): string | null {
  return lastError;
}

function describe(error: unknown): string {
  const e = error as { code?: string; message?: string } | undefined;
  const text = `${e?.code ? `${e.code}: ` : ""}${e?.message ?? String(error)}`;
  return text.replace(/postgres(ql)?:\/\/\S+/gi, "[address hidden]").slice(0, 200);
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// Vercel pauses the server between visits. While it's paused, the network can quietly drop the database
// connection, but the connection pool doesn't know that; the next query is sent into a dead connection
// and waits until something times out. So a connection that has sat unused for a while is replaced with a
// fresh one (about 0.1s) instead of being trusted. (Same approach as AutoDash.)
const IDLE_REPLACE_MS = 10_000;

function openPool(url: string): Sql {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    prepare: false, // required by Supabase's transaction pooler
    onnotice: () => undefined, // "already exists, skipping" notes from setup aren't worth logging
    max: 5,
    idle_timeout: 20,
    max_lifetime: 5 * 60,
    connect_timeout: 4,
    ssl: local ? false : "require",
  });
}

let lastUsed = 0;
export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const now = Date.now();
  if (client && now - lastUsed > IDLE_REPLACE_MS) {
    retire(client);
    client = null;
  }
  client ??= openPool(url);
  lastUsed = now;
  return client;
}

function retire(pool: Sql | null) {
  if (!pool) return;
  // The old connection stays usable for 2 more minutes in case slower work is still using it.
  const timer = setTimeout(() => void pool.end({ timeout: 10 }).catch(() => undefined), 120_000);
  timer.unref?.();
}

/** Throw away the connection now (after a query hung), so the next request starts on a fresh one. */
export function resetDb() {
  retire(client);
  client = null;
}

/** Rejects if `work` hasn't finished in time, so a stuck connection can't freeze a page. */
export function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    Promise.resolve(work).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Errors that mean "the connection went away", not "the query was wrong": safe to retry on a new connection. */
export function isConnectionError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = error instanceof Error ? error.message : String(error);
  return /^(CONNECTION_(ENDED|CLOSED|DESTROYED)|CONNECT_TIMEOUT|ECONNRESET|EPIPE|ETIMEDOUT|57P01)$/.test(code)
    || /CONNECTION_(ENDED|CLOSED|DESTROYED)|ECONNRESET|socket hang up|terminating connection/i.test(message);
}

/**
 * Runs page work that reads the database. Normal reads take milliseconds, so if it hasn't finished in 4 seconds
 * it's almost certainly stuck on a dead connection: throw that connection away and try once more on a fresh one.
 */
export async function fresh<T>(label: string, work: () => Promise<T>, firstTryMs = 4000, retryMs = 6000): Promise<T> {
  try {
    return await withTimeout(work(), firstTryMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith("timed out") && !isConnectionError(error)) throw error;
    console.warn(`[mw] ${label}: ${isConnectionError(error) ? `connection dropped (${message})` : `stuck after ${firstTryMs}ms`}, retrying on a fresh connection`);
    resetDb();
    return withTimeout(work(), retryMs);
  }
}

export type DbState = "not_configured" | "ready" | "unreachable";

export const SCHEMA_VERSION = "10";
let setupPromise: Promise<void> | null = null;
function setupOnce(): Promise<void> {
  setupPromise ??= import("./schema")
    .then(({ setupDatabase }) => setupDatabase())
    .catch((error) => {
      setupPromise = null; // try again on the next request
      throw error;
    });
  return setupPromise;
}

/** Whether the tables exist, creating them on first use. Cached briefly so every page load doesn't ask. */
export async function dbState(): Promise<DbState> {
  if (!db()) return "not_configured";
  if (readyCache?.value && Date.now() - readyCache.at < 5 * 60_000) return "ready";
  try {
    const rows = await fresh("database check", async () => {
      const sql = db()!;
      try {
        return await sql`select value from mw_settings where key = 'schema_version'`;
      } catch (error) {
        // Only a brand-new database (mw_settings doesn't exist yet: 42P01) means "set up from scratch".
        if ((error as { code?: string })?.code !== "42P01") throw error;
        return [];
      }
    }, 9000);
    lastError = null;
    if (rows[0]?.value !== SCHEMA_VERSION) await setupOnce(); // brand-new or older database: create/upgrade the tables
    readyCache = { value: true, at: Date.now() };
    return "ready";
  } catch (error) {
    lastError = describe(error);
    readyCache = null;
    console.error("Database unreachable or setup failed:", lastError);
    return "unreachable";
  }
}

export function markReady() {
  readyCache = { value: true, at: Date.now() };
}

export async function readyDb(): Promise<Sql | null> {
  return (await dbState()) === "ready" ? db() : null;
}
