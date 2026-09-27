// Shared Postgres connection (Supabase). Everything that needs saving goes through here.
// When DATABASE_URL isn't set, db() returns null and pages show "turns on when the database is connected".
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

export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!client) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    client = postgres(url, {
      prepare: false, // required by Supabase's transaction pooler
      max: 3,
      idle_timeout: 20,
      connect_timeout: 8,
      ssl: local ? false : "require",
    });
  }
  return client;
}

export type DbState = "not_configured" | "not_set_up" | "ready" | "unreachable";

/** Whether the tables exist. Cached briefly so every page load doesn't ask. */
export async function dbState(): Promise<DbState> {
  const sql = db();
  if (!sql) return "not_configured";
  if (readyCache?.value && Date.now() - readyCache.at < 5 * 60_000) return "ready";
  try {
    const [row] = await withTimeout(sql`
      select (to_regclass('public.appointments') is not null and to_regclass('public.leads') is not null) as ready,
             (select value from app_settings where key = 'schema_version') as version`.catch(async () =>
        // app_settings doesn't exist yet on a brand-new database
        sql`select false as ready, null as version`), 9000);
    lastError = null;
    if (!row.ready || row.version !== SCHEMA_VERSION) {
      // Brand-new or older database: create/upgrade the tables automatically. No button needed.
      await setupOnce();
    }
    readyCache = { value: true, at: Date.now() };
    return "ready";
  } catch (error) {
    lastError = describe(error);
    readyCache = null;
    console.error("Database unreachable or setup failed:", lastError);
    return "unreachable";
  }
}

export const SCHEMA_VERSION = "3";
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

export async function readyDb(): Promise<Sql | null> {
  return (await dbState()) === "ready" ? db() : null;
}

export function markReady() {
  readyCache = { value: true, at: Date.now() };
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
