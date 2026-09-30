// Runs one part of a page. If it fails or takes too long, the rest of the page still loads and the reason
// is shown, instead of the whole page breaking (or hanging until the server cuts the connection).
import { resetDb, trace } from "@/lib/db";

export type Loaded<T> = { data: T; error: string | null };

export async function attempt<T>(label: string, work: () => Promise<T>, fallback: T, timeoutMs = 8000): Promise<Loaded<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  trace("step", `${label}: started`);
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`took longer than ${timeoutMs / 1000} seconds`)), timeoutMs);
    });
    const data = await Promise.race([work(), timeout]);
    trace("step", `${label}: done`, Date.now() - started);
    return { data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[autodash:step] ${label}: FAILED after ${Date.now() - started}ms: ${message}`);
    // A query that hangs this long is almost always sitting on a dead connection: start fresh next time.
    if (message.startsWith("took longer")) resetDb(`${label} hung`);
    return { data: fallback, error: `${label}: ${message.slice(0, 300)}` };
  } finally {
    clearTimeout(timer);
  }
}
