// A tiny short-lived memory cache for numbers that are expensive to work out and fine to be a few seconds old (Analytics, the sidebar
// counts). If several requests ask for the same thing at once, it's only worked out once, but a request that has been stuck for a few
// seconds is NOT shared: the next asker (for example a retry on a fresh database connection) starts its own.
const store = new Map<string, { at: number; value: unknown }>();
type Running = { at: number; promise: Promise<unknown> };
const running = new Map<string, Running>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: { shareForMs?: number } = {}): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const inflight = running.get(key);
  if (inflight && Date.now() - inflight.at < (opts.shareForMs ?? 3500)) return inflight.promise as Promise<T>;
  const entry: Running = {
    at: Date.now(),
    promise: load().then((value) => { store.set(key, { at: Date.now(), value }); return value; }).finally(() => { if (running.get(key) === entry) running.delete(key); }),
  };
  running.set(key, entry);
  return entry.promise as Promise<T>;
}

/** Forget saved numbers whose name starts with this, so the next look works them out fresh (after something changed). */
export function dropCached(prefix: string) {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}
