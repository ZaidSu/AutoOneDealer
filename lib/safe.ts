// Runs one part of a page. If it fails, the rest of the page still loads and the reason is shown,
// instead of the whole page breaking with a hidden error.
export type Loaded<T> = { data: T; error: string | null };

export async function attempt<T>(label: string, work: () => Promise<T>, fallback: T): Promise<Loaded<T>> {
  try {
    return { data: await work(), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${label}] failed:`, message);
    return { data: fallback, error: `${label}: ${message.slice(0, 300)}` };
  }
}
