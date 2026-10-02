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

// Vercel pauses the server between visits. While it's paused, the network can quietly drop the database
// connection, but the connection pool doesn't know that; the next query is sent into a dead connection
// and waits until something times out (the "took longer than 8 seconds" errors). So a connection that has
// sat unused for a while is replaced with a fresh one (about 0.1s) instead of being trusted.
const IDLE_REPLACE_MS = 10_000;

function openPool(url: string, max: number, connectTimeout: number): Sql {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    prepare: false, // required by Supabase's transaction pooler
    debug: process.env.DB_DEBUG ? (_c: number, q: string) => console.log("[q]", new Date().toISOString().slice(17, 23), q.replace(/\s+/g, " ").slice(0, 60)) : undefined,
    onnotice: () => undefined, // "already exists, skipping" notes from setup aren't worth logging
    max,
    idle_timeout: 20,
    max_lifetime: 5 * 60,
    connect_timeout: connectTimeout, // a healthy connection takes ~0.1s; don't let a stalled one hold a page for long
    ssl: local ? false : "require",
  });
}

function retire(pool: Sql | null, name: string, reason: string) {
  if (!pool) return;
  trace("db", `replacing ${name} connection (${reason})`);
  // New requests get a fresh connection right away, but the old one stays usable for 2 more minutes: a slower task
  // started earlier (the lead import, the AI writing replies) may still be using it, and closing it under them caused
  // "write CONNECTION_ENDED" errors. After that it's closed for good. Never waited on by a page.
  const timer = setTimeout(() => void pool.end({ timeout: 10 }).catch(() => undefined), 120_000);
  timer.unref?.();
}

let lastUsed = 0;
export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const now = Date.now();
  if (client && now - lastUsed > IDLE_REPLACE_MS) {
    retire(client, "page", `unused for ${Math.round((now - lastUsed) / 1000)}s`);
    client = null;
  }
  if (!client) {
    // Keep a little concurrency for Dashboard/Customers without opening many fresh connections per server.
    client = openPool(url, 5, 4);
    trace("db", "opened page connection");
  }
  lastUsed = now;
  return client;
}

let bgClient: Sql | null = null;
let bgLastUsed = 0;
/** A separate small connection pool for the background lead import, so page loads never wait behind it. */
export function bgDb(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const now = Date.now();
  if (bgClient && now - bgLastUsed > IDLE_REPLACE_MS) {
    retire(bgClient, "background", `unused for ${Math.round((now - bgLastUsed) / 1000)}s`);
    bgClient = null;
  }
  bgClient ??= openPool(url, 1, 8);
  bgLastUsed = now;
  return bgClient;
}

/** Throw away the page connection now (after a query hung), so the next request starts on a fresh one. */
export function resetDb(reason: string) {
  retire(client, "page", reason);
  client = null;
}

/**
 * Runs page work that reads the database. Normal reads take milliseconds, so if it hasn't finished in 4 seconds
 * it's almost certainly stuck on a dead connection: throw that connection away and try once more on a fresh one.
 * Worst case a page waits about 10 seconds and shows an error, instead of hanging until the server gives up.
 */
/** Errors that mean "the connection went away", not "the query was wrong": safe to retry on a new connection. */
export function isConnectionError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = error instanceof Error ? error.message : String(error);
  return /^(CONNECTION_(ENDED|CLOSED|DESTROYED)|CONNECT_TIMEOUT|ECONNRESET|EPIPE|ETIMEDOUT|57P01)$/.test(code)
    || /CONNECTION_(ENDED|CLOSED|DESTROYED)|ECONNRESET|socket hang up|terminating connection/i.test(message);
}

export async function fresh<T>(label: string, work: () => Promise<T>, firstTryMs = 4000, retryMs = 6000): Promise<T> {
  const started = Date.now();
  try {
    const result = await withTimeout(work(), firstTryMs);
    trace("step", `${label}: done`, Date.now() - started);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Stuck, or the connection was dropped (by the network or Supabase): retry once on a fresh one.
    // Any other error is real, and is shown instead of being hidden behind a retry.
    if (!message.startsWith("timed out") && !isConnectionError(error)) throw error;
    console.warn(`[autodash:step] ${label}: ${isConnectionError(error) ? `connection dropped (${message})` : `stuck after ${firstTryMs}ms`}, retrying on a fresh connection`);
    resetDb(`${label} ${isConnectionError(error) ? "lost its connection" : "stuck"}`);
    const result = await withTimeout(work(), retryMs).catch((e) => {
      console.error(`[autodash:step] ${label}: FAILED again after retry (${Date.now() - started}ms total)`);
      throw e;
    });
    console.warn(`[autodash:step] ${label}: recovered on retry (${Date.now() - started}ms total)`);
    return result;
  }
}

/**
 * Debug trail in the server logs (Vercel -> Logs), like console.log("got here") while debugging.
 * Always on for connection events and anything slow; set AUTODASH_DEBUG=1 to log every step.
 */
export function trace(area: string, message: string, ms?: number) {
  const slow = ms !== undefined && ms >= 1000;
  // Without AUTODASH_DEBUG: only connection events and slow steps, so the logs stay readable.
  if (!process.env.AUTODASH_DEBUG && (ms !== undefined ? !slow : area !== "db")) return;
  const line = `[autodash:${area}] ${message}${ms !== undefined ? ` (${ms}ms)` : ""}`;
  if (slow) console.warn(line + " <- slow");
  else console.log(line);
}

export type DbState = "not_configured" | "not_set_up" | "ready" | "unreachable";

/** Whether the tables exist. Cached briefly so every page load doesn't ask. */
// What a newly started server spent before it could answer (sent along with the stopwatch notes).
export type StartupTrace = { startedAt: number; dnsMs?: number; tcpMs?: number; firstQueryMs?: number; fallback?: boolean; retried?: boolean; setupMs?: number; error?: string };
export let startupTrace: StartupTrace | null = null;
let probePromise: Promise<unknown> | null = null;
/** The startup trace once the network probe has finished (waits at most 3 seconds). */
export async function startupReport(): Promise<StartupTrace | null> {
  await dbState();
  if (probePromise) await Promise.race([probePromise, new Promise((r) => setTimeout(r, 3000))]);
  return startupTrace;
}

/** Times finding the database's address and opening a plain network connection to it (once per server). */
async function probeNetwork(url: string): Promise<Partial<StartupTrace>> {
  const { lookup } = await import("node:dns/promises");
  const net = await import("node:net");
  const u = new URL(url);
  const t0 = Date.now();
  const addr = await lookup(u.hostname);
  const t1 = Date.now();
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(Number(u.port || 5432), addr.address);
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error("tcp timeout")); });
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("error", reject);
  });
  return { dnsMs: t1 - t0, tcpMs: Date.now() - t1 };
}

export async function dbState(): Promise<DbState> {
  const sql = db();
  if (!sql) return "not_configured";
  if (readyCache?.value && Date.now() - readyCache.at < 5 * 60_000) return "ready";
  if (!startupTrace) {
    startupTrace = { startedAt: Date.now() };
    probePromise = probeNetwork(process.env.DATABASE_URL!).then((p) => Object.assign(startupTrace!, p))
      .catch((e) => { startupTrace!.error ??= `probe: ${e instanceof Error ? e.message : e}`; });
  }
  try {
    const [row] = await withTimeout(sql`
      select (to_regclass('public.appointments') is not null and to_regclass('public.leads') is not null) as ready,
             (select value from app_settings where key = 'schema_version') as version,
             (select value from app_settings where key = 'customers_built') as built`.catch(async (error) => {
        // Only a brand-new database (app_settings doesn't exist yet: 42P01) means "set up from scratch".
        // Anything else (a slow or failed connection) is a real error; it must not re-run the upgrade.
        if ((error as { code?: string })?.code !== "42P01") {
          // A stalled or failed first connection: try once more on a fresh connection (no setup).
          if (startupTrace) startupTrace.retried = true;
          return sql`
            select (to_regclass('public.appointments') is not null and to_regclass('public.leads') is not null) as ready,
                   (select value from app_settings where key = 'schema_version') as version,
                   (select value from app_settings where key = 'customers_built') as built`;
        }
        if (startupTrace) startupTrace.fallback = true;
        return sql`select false as ready, null as version, null as built`;
      }), 9000);
    if (startupTrace && startupTrace.firstQueryMs === undefined) startupTrace.firstQueryMs = Date.now() - startupTrace.startedAt;
    lastError = null;
    if (!row.ready || row.version !== SCHEMA_VERSION) {
      // Brand-new or older database: create/upgrade the tables automatically. No button needed.
      const setupStarted = Date.now();
      await setupOnce();
      if (startupTrace) startupTrace.setupMs = Date.now() - setupStarted;
    }
    readyCache = { value: true, at: Date.now() };
    return "ready";
  } catch (error) {
    lastError = describe(error);
    readyCache = null;
    if (startupTrace && !startupTrace.error) startupTrace.error = lastError.slice(0, 120);
    console.error("Database unreachable or setup failed:", lastError);
    return "unreachable";
  }
}

export const SCHEMA_VERSION = "19";
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
  const started = Date.now();
  const state = await dbState();
  trace("db", `database check: ${state}`, Date.now() - started);
  return state === "ready" ? db() : null;
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
