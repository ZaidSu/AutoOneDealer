import type { Metadata } from "next";
import Link from "next/link";
import AiScheduleForm from "@/components/ai/AiScheduleForm";
import AlertSettings from "@/components/ai/AlertSettings";
import DigestSettings from "@/components/ai/DigestSettings";
import PurchaseFollowupSettings from "@/components/ai/PurchaseFollowupSettings";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { canSendFrom } from "@/lib/auth/google";
import { requirePageStaff } from "@/lib/auth/guard";
import { getAlertSettings } from "@/lib/ai/alerts";
import { getDigestSettings, getDigestStatus } from "@/lib/ai/digest";
import { describeSchedule, getAiSchedule } from "@/lib/ai/schedule";
import { getGmailConnection } from "@/lib/gmail/connection";
import { dbState, fresh } from "@/lib/db";
import { getAutoText, getPurchaseFollowup, listPurchases } from "@/lib/sms";
import { twilioConfigured } from "@/lib/sms/twilio";

export const metadata: Metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const LABEL: Record<string, string> = {
  scheduled: "Scheduled", due: "Due now", sent: "Text written", off: "Off for this customer", no_phone: "Needs a phone number", too_late: "Skipped (too long ago)", not_purchased: "",
};

export default async function AutomationsPage() {
  const staff = await requirePageStaff();
  const header = <PageHeader title="Automations" description="Things the AI does on its own." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Automations" /></>;
  const settings = await fresh("Automations", () => getPurchaseFollowup());
  const [purchases, autoText, schedule, digest, connection, digestStatus, alerts] = await Promise.all([listPurchases(settings.days), getAutoText(), getAiSchedule(), getDigestSettings(), getGmailConnection(), getDigestStatus(), getAlertSettings()]);
  const statusText = digestStatus ? `${digestStatus.sent ? "sent" : "not sent"} (${digestStatus.reason}), ${new Date(digestStatus.at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "the timer hasn't checked yet. If this stays empty, the timer (cron-job.org) isn't calling AutoDash.";
  const canChange = can.editAiSettings(staff.role);

  return (
    <div className="max-w-4xl">
      {header}
      <section aria-labelledby="hours" className="panel p-5">
        <h2 id="hours" className="text-lg font-semibold">When the AI works</h2>
        <p className="mt-1 text-sm text-muted">
          The AI writes and sends emails and texts only on these days and between these times (Dallas time). Right now: {describeSchedule(schedule)}.
          Anything that arrives outside these hours waits until the AI is working again.
        </p>
        <div className="mt-4 border-t border-line pt-4"><AiScheduleForm initial={schedule} canChange={canChange} /></div>
      </section>

      <section aria-labelledby="digest" className="panel mt-8 p-5">
        <h2 id="digest" className="text-lg font-semibold">Update emails to the dealership inbox</h2>
        <p className="mt-1 text-sm text-muted">
          While the AI is working, AutoDash emails a short update (default every 1 hour 30 minutes): who needs to be contacted, what they asked about, what the AI already emailed, and what&apos;s waiting for approval.
          Nothing is sent when nothing happened.
        </p>
        <div className="mt-4 border-t border-line pt-4"><DigestSettings initial={digest} mailbox={connection?.mailbox ?? ""} canChange={canChange} canSend={canSendFrom(connection)} status={statusText} /></div>
      </section>

      <section aria-labelledby="alerts" className="panel mt-8 p-5">
        <h2 id="alerts" className="text-lg font-semibold">More alerts to the dealership inbox</h2>
        <p className="mt-1 text-sm text-muted">Short emails for things that need a person. Each one can be turned off or changed.</p>
        <div className="mt-4 border-t border-line pt-4"><AlertSettings initial={alerts} mailbox={connection?.mailbox ?? ""} canChange={canChange} /></div>
      </section>

      <section aria-labelledby="pf" className="panel mt-8 p-5">
        <h2 id="pf" className="text-lg font-semibold">Follow up after a purchase</h2>
        <p className="mt-1 text-sm text-muted">
          When you mark a customer <b>Purchased</b> (or add them with &ldquo;They already bought a car&rdquo;), the AI texts them a few days later to ask how the car is doing. Each customer gets one text.
          {" "}{autoText ? `Automatic texting is on, so it sends by itself ${describeSchedule(schedule)}.` : "Automatic texting is off, so the AI writes it as a draft and someone clicks Send on the customer's page."}
          {!twilioConfigured() && " Nothing is sent until Twilio is connected; purchases made before then are texted once it is (if they're still within a few weeks)."}
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <PurchaseFollowupSettings initialOn={settings.on} initialDays={settings.days} canChange={canChange} />
        </div>
      </section>

      <section aria-labelledby="recent" className="mt-8">
        <h2 id="recent" className="mb-3 text-lg font-semibold">Recent purchases</h2>
        {purchases.length === 0 ? <p className="panel p-5 text-muted">No purchases yet. Mark a customer Purchased, or use Add customer on the Customers page.</p> : (
          <ul className="panel divide-y divide-line">
            {purchases.map((p) => (
              <li key={p.key}>
                <Link href={`/customers/${encodeURIComponent(p.key)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper/60">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{p.name || p.phone || "Customer"}</span>
                    <span className="text-muted">{p.vehicle ? ` · ${p.vehicle}` : ""} · bought {day(p.purchasedAt)}</span>
                  </span>
                  <span className="text-sm text-muted">{LABEL[p.state]}{p.state === "scheduled" && p.dueOn ? ` for ${day(p.dueOn)}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
