// The set of actions the pages use. The real database (app/actions.ts) and preview mode (lib/preview/actions.ts)
// both provide them, and TypeScript checks they stay identical.
import type * as Server from "@/app/actions";

export type Actions = typeof Server;
