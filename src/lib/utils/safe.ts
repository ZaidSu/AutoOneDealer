// Runs one part of a page. If it fails or takes too long, the rest of the page still loads and the reason
// is shown, instead of the whole page breaking (or hanging until the server cuts the connection).
// A part that gets stuck is retried once on a fresh database connection first (see fresh() in lib/db).
import { fresh } from "@/lib/db";

export type Loaded<T> = { data: T; error: string | null };

export async function attempt<T>(label: string, work: () => Promise<T>, fallback: T): Promise<Loaded<T>> {
  try {
    return { data: await fresh(label, work), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[autodash:step] ${label}: FAILED: ${message}`);
    const friendly = message.startsWith("timed out") ? "the database didn't answer in time" : message;
    return { data: fallback, error: `${label}: ${friendly.slice(0, 300)}` };
  }
}
