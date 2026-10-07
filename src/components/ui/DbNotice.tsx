import type { DbState } from "@/lib/db";

// Friendly note shown when the database isn't connected or can't be reached.
export default function DbNotice({ state }: { state: Exclude<DbState, "ready"> }) {
  return (
    <div className="card max-w-xl">
      <h2>{state === "not_configured" ? "The database isn\u2019t connected yet" : "Can\u2019t reach the database right now"}</h2>
      <p className="mt-2 text-muted">
        {state === "not_configured"
          ? "Add DATABASE_URL in Vercel (Settings > Environment Variables), or in .env.local on your computer, then redeploy. The tables are created automatically the first time the site connects."
          : "Try again in a minute. If it keeps happening, check that DATABASE_URL is the Supabase Transaction pooler address (port 6543) with your database password filled in."}
      </p>
    </div>
  );
}
