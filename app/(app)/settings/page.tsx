import type { Metadata } from "next";
import GmailCard from "@/components/settings/GmailCard";
import TeamAndSources from "@/components/settings/TeamAndSources";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { dbState } from "@/lib/db";
import { listReps, listSources } from "@/lib/db/data";
import { can, roleLabel } from "@/lib/auth/access";
import { dealershipMailbox } from "@/lib/auth/config";
import { getStaffSession } from "@/lib/auth/session";
import { getGmailConnection } from "@/lib/gmail/connection";

export const metadata: Metadata = { title: "Settings" };

const gmailNotices: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Gmail connected." },
  denied: { tone: "error", text: "Gmail access wasn't granted. Click Connect Gmail and choose Allow on Google's screen." },
  wrong_account: { tone: "error", text: "That's not the dealership inbox. Connect again and pick the dealership's Google account." },
  no_refresh_token: { tone: "error", text: "Google didn't grant ongoing access. Click Connect Gmail again." },
  forbidden: { tone: "error", text: "Only owners and managers can connect the inbox." },
  config: { tone: "error", text: "The Gmail connection isn't set up on this site yet. Let your administrator know." },
  failed: { tone: "error", text: "Google didn't finish connecting. Please try again." },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = (await getStaffSession())!;
  const gmail = await getGmailConnection();
  const state = await dbState();
  const [reps, sources] = state === "ready" ? await Promise.all([listReps(), listSources()]) : [[], []];
  const params = await searchParams;
  const notice = params.gmail ? gmailNotices[params.gmail] ?? gmailNotices.failed : null;

  return (
    <>
      <PageHeader title="Settings" description="Your account and the dealership's connected services." />
      <div className="grid max-w-3xl gap-6">
        <section aria-labelledby="account-heading" className="rounded-lg border border-line bg-white p-6">
          <h2 id="account-heading" className="text-lg font-semibold">Your account</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[120px_1fr]">
            <dt className="text-muted">Name</dt>
            <dd>{staff.name}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{staff.email || "Not set"}</dd>
            <dt className="text-muted">Role</dt>
            <dd>{roleLabel[staff.role]}</dd>
          </dl>
          <form action="/api/logout" method="post" className="mt-5">
            <button type="submit" className="inline-flex h-10 items-center rounded-md px-4 font-semibold ring-1 ring-line hover:bg-paper">
              Sign out
            </button>
          </form>
        </section>

        <GmailCard
          connection={gmail ? { mailbox: gmail.mailbox, connectedAt: gmail.connectedAt, connectedBy: gmail.connectedBy } : null}
          canManage={can.manageIntegrations(staff.role)}
          expectedMailbox={dealershipMailbox()}
          notice={notice}
          shared={state === "ready"}
        />

        {state === "ready" ? (
          <TeamAndSources reps={reps} sources={sources} canEdit={can.manageIntegrations(staff.role)} />
        ) : (
          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="text-lg font-semibold">Sales team and lead sources</h2>
            <p className="mt-1 mb-4 text-muted">Add or remove salespeople and the “Heard about us” choices.</p>
            <DbNotice state={state} what="This" />
          </section>
        )}

        <section aria-labelledby="sms-heading" className="rounded-lg border border-line bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="sms-heading" className="text-lg font-semibold">Text messaging</h2>
            <span className="rounded-full bg-paper px-3 py-0.5 text-sm font-medium text-muted ring-1 ring-line">Not set up</span>
          </div>
          <p className="mt-2 text-muted">Two-way texting with customers will be added in a later phase, after consent and opt-out handling are in place.</p>
        </section>
      </div>
    </>
  );
}
