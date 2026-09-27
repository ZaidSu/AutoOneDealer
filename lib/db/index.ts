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
  if (readyCache?.value && Date.now() - readyCache.at < 60_000) return "ready";
  try {
    const [row] = await withTimeout(sql`select (to_regclass('public.appointments') is not null and to_regclass('public.leads') is not null) as ready`, 9000);
    readyCache = { value: Boolean(row.ready), at: Date.now() };
    lastError = null;
    if (row.ready) await upgradeOnce(sql);
    return row.ready ? "ready" : "not_set_up";
  } catch (error) {
    lastError = describe(error);
    console.error("Database unreachable:", lastError);
    return "unreachable";
  }
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

// Adds newer columns to databases set up before they existed. Runs once per server instance.
let upgraded: Promise<void> | null = null;
function upgradeOnce(sql: Sql): Promise<void> {
  upgraded ??= import("./schema")
    .then(({ UPGRADE_SQL }) => sql.unsafe(UPGRADE_SQL))
    .then(() => undefined)
    .catch((error) => {
      upgraded = null;
      console.error("Database upgrade failed:", error instanceof Error ? error.message : error);
    });
  return upgraded;
}
