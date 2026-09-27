import type { Metadata } from "next";
import { headers } from "next/headers";
import DeveloperNotice from "@/components/developer/DeveloperNotice";
import SetupDatabase from "@/components/database/SetupDatabase";
import PageHeader from "@/components/ui/PageHeader";
import { dbState, lastDbError } from "@/lib/db";
import { can } from "@/lib/auth/access";
import { OPTIONAL_VARS, REQUIRED_VARS } from "@/lib/auth/config";
import { getStaffSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Developer" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DeveloperPage() {
  const staff = (await getStaffSession())!;

  if (!can.useDeveloperTools(staff.role)) {
    return (
      <>
        <DeveloperNotice />
        <PageHeader title="Developer" />
        <p className="max-w-xl rounded-lg border border-line bg-white p-6 text-muted">
          Your role doesn't include developer tools. If you need something changed, ask the dealership owner.
        </p>
      </>
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const expectedCallback = `${proto}://${host}/api/google-callback`;
  const configuredCallback = process.env.GOOGLE_REDIRECT_URI ?? "";
  const callbackMatches = configuredCallback === expectedCallback;
  const secret = process.env.SESSION_SECRET ?? "";
  const database = await dbState();
  const dbText: Record<typeof database, string> = {
    not_configured: "Not connected. Add DATABASE_URL (the Supabase Transaction pooler address) in Vercel for Production and Preview, then redeploy.",
    not_set_up: "Connected, but the tables haven't been created yet.",
    ready: "Connected and ready.",
    unreachable: "DATABASE_URL is set, but the database didn't answer. Check the address and password, or whether the Supabase project is paused.",
  };

  const rows = [
    ...REQUIRED_VARS.map((name) => ({ name, required: true, set: Boolean(process.env[name]) })),
    ...OPTIONAL_VARS.map((name) => ({ name, required: false, set: Boolean(process.env[name]) })),
    { name: "DATABASE_URL", required: false, set: Boolean(process.env.DATABASE_URL) },
  ];

  return (
    <>
      <DeveloperNotice />
      <PageHeader title="Developer" description="Setup status for this deployment. Secret values are never shown." />

      <div className="grid max-w-4xl gap-6">
        <section aria-labelledby="env-heading" className="rounded-lg border border-line bg-white p-6">
          <h2 id="env-heading" className="text-lg font-semibold">Environment variables</h2>
          <p className="mt-1 text-sm text-muted">Environment: {process.env.VERCEL_ENV ?? "local"}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[15px]">
              <thead className="text-sm text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Needed</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2 pr-4 text-muted">{row.required ? "Required" : "Optional"}</td>
                    <td className={`py-2 ${row.set ? "text-go" : row.required ? "text-signal" : "text-muted"}`}>
                      {row.set ? "Set" : "Missing"}
                      {row.name === "SESSION_SECRET" && row.set && secret.length < 32 ? " (too short: needs 32+ characters)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="oauth-heading" className="rounded-lg border border-line bg-white p-6">
          <h2 id="oauth-heading" className="text-lg font-semibold">Google redirect</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[190px_minmax(0,1fr)]">
            <dt className="text-muted">This site expects</dt>
            <dd className="break-all">{expectedCallback}</dd>
            <dt className="text-muted">GOOGLE_REDIRECT_URI is</dt>
            <dd className="break-all">{configuredCallback || "Not set"}</dd>
          </dl>
          <p className={`mt-4 rounded-md px-4 py-3 text-sm ${callbackMatches ? "bg-go-soft text-go" : "border border-signal/25 bg-warn-soft"}`}>
            {callbackMatches
              ? "They match. The same address must also be listed under Authorized redirect URIs in Google Cloud."
              : "They don't match, so Google sign-in will fail on this address. Set GOOGLE_REDIRECT_URI for this environment to the expected value and add it in Google Cloud."}
          </p>
        </section>

        <section aria-labelledby="db-heading" className="rounded-lg border border-line bg-white p-6">
          <h2 id="db-heading" className="text-lg font-semibold">Database</h2>
          <p className={`mt-1 ${database === "ready" ? "text-go" : "text-muted"}`}>{dbText[database]}</p>
          {database === "unreachable" && lastDbError() && <p className="mt-2 break-words text-xs text-muted">Details: {lastDbError()}</p>}
          {(database === "not_set_up" || database === "ready") && (
            <SetupDatabase label={database === "ready" ? "Run setup again (safe)" : "Set up database"} />
          )}
        </section>

        <section aria-labelledby="checks-heading" className="rounded-lg border border-line bg-white p-6">
          <h2 id="checks-heading" className="text-lg font-semibold">Checks</h2>
          <p className="mt-1 text-muted">
            Server health: <a className="font-semibold text-signal hover:underline" href="/api/health">/api/health</a>
          </p>
        </section>
      </div>
    </>
  );
}
