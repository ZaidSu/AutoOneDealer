import type { DbState } from "@/lib/db";

// Friendly note for features that need the shared database.
export default function DbNotice({ state, what }: { state: DbState; what: string }) {
  const text =
    state === "not_configured"
      ? `${what} turns on when the database is connected.`
      : state === "not_set_up"
        ? `${what} is almost ready. Open the Developer page and click Set up database.`
        : `${what} can't reach the database right now. Try again in a minute.`;
  return <p className="rounded-md border border-dashed border-line bg-white px-4 py-3 text-sm text-muted">{text}</p>;
}
