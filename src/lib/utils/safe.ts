// Runs one part of a page. If it fails or takes too long, the rest of the page still loads and the reason
// is shown, instead of the whole page breaking (or hanging until the server cuts the connection).
export type Loaded<T> = { data: T; error: string | null };

export async function attempt<T>(label: string, work: () => Promise<T>, fallback: T, timeoutMs = 8000): Promise<Loaded<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`took longer than ${timeoutMs / 1000} seconds`)), timeoutMs);
    });
    return { data: await Promise.race([work(), timeout]), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${label}] failed:`, message);
    return { data: fallback, error: `${label}: ${message.slice(0, 300)}` };
  } finally {
    clearTimeout(timer);
  }
}
