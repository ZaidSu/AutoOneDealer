// A tiny short-lived memory cache for numbers that are expensive to work out and fine to be a few seconds old (Analytics, the sidebar
// counts). Also makes sure that if several requests ask for the same thing at once, it's only worked out once.
const store = new Map<string, { at: number; value: unknown }>();
const running = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const inflight = running.get(key);
  if (inflight) return inflight as Promise<T>;
  const work = load().then((value) => { store.set(key, { at: Date.now(), value }); return value; }).finally(() => running.delete(key));
  running.set(key, work);
  return work;
}

/** Forget saved numbers whose name starts with this, so the next look works them out fresh (after something changed). */
export function dropCached(prefix: string) {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}
