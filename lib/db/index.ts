// Shared Postgres connection (Supabase). Everything that needs saving goes through here.
// When DATABASE_URL isn't set, db() returns null and pages show "turns on when the database is connected".
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
let client: Sql | null = null;
let readyCache: { value: boolean; at: number } | null = null;

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
      connect_timeout: 10,
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
    const [row] = await sql`select to_regclass('public.appointments') is not null as ready`;
    readyCache = { value: Boolean(row.ready), at: Date.now() };
    return row.ready ? "ready" : "not_set_up";
  } catch (error) {
    console.error("Database unreachable:", error instanceof Error ? error.message.slice(0, 120) : "unknown");
    return "unreachable";
  }
}

export async function readyDb(): Promise<Sql | null> {
  return (await dbState()) === "ready" ? db() : null;
}

export function markReady() {
  readyCache = { value: true, at: Date.now() };
}
