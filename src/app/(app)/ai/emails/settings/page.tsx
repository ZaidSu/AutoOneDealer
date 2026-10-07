import type { Metadata } from "next";
import AiChannelSwitch from "@/components/ai/AiChannelSwitch";
import { EmailSettingsPanel } from "@/components/ai/AiRepliesView";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { aiConfigured } from "@/lib/ai/claude";
import { getAutoSend } from "@/lib/ai/replies";
import { channelOn } from "@/lib/ai/switches";
import { can } from "@/lib/auth/access";
import { canSendFrom } from "@/lib/auth/google";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getSetting } from "@/lib/db/data";
import { getGmailConnection } from "@/lib/gmail/connection";

export const metadata: Metadata = { title: "Email settings" };
export const dynamic = "force-dynamic";

export default async function AiEmailSettingsPage() {
  const staff = await requirePageStaff();
  const header = <PageHeader title="Email settings" description="Turn the AI on or off for emails, choose whether it sends by itself, and check that everything is connected." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI email settings" /></>;
  const [connection, lastTimer, autoSend, lastReport, enabled] = await fresh("AI email settings", () => Promise.all([
    getGmailConnection(), getSetting("last_timer_run"), getAutoSend(), getSetting("last_timer_report"), channelOn("email"),
  ]));
  let report: { at: number; leads: unknown; ai: unknown } | null = null;
  try { report = lastReport ? JSON.parse(lastReport) : null; } catch { /* ignore */ }
  const canChange = can.editAiSettings(staff.role);
  return (
    <div className="max-w-4xl">
      {header}
      <section aria-label="AI on or off" className="panel mb-6 p-5">
        <AiChannelSwitch channel="email" initial={enabled} canChange={canChange} />
      </section>
      <EmailSettingsPanel
        setup={{ ai: aiConfigured(), canSend: canSendFrom(connection), gmail: Boolean(connection), lastTimer: lastTimer ? Number(lastTimer) : null }}
        canWriteNow={canChange} autoSend={autoSend} lastReport={report ? describeReport(report) : null} />
    </div>
  );
}

/** The last timer run, in plain words: "Found 1 new lead. Wrote 1 reply." */
function describeReport(r: { leads: unknown; ai: unknown }): string {
  const parts: string[] = [];
  if (r.leads && typeof r.leads === "object") {
    const added = Number((r.leads as { added?: number }).added ?? 0);
    parts.push(added ? `Found ${added} new lead${added === 1 ? "" : "s"}.` : "No new lead emails.");
  } else if (typeof r.leads === "string") parts.push(`Leads: ${r.leads}.`);
  if (r.ai && typeof r.ai === "object") {
    const a = r.ai as { drafted?: number; sent?: number; skipped?: number; waiting?: string | null };
    if (a.waiting) parts.push(a.waiting);
    else parts.push(`Wrote ${a.drafted ?? 0} repl${a.drafted === 1 ? "y" : "ies"}${a.sent ? `, sent ${a.sent}` : ""}${a.skipped ? `, skipped ${a.skipped}` : ""}.`);
  } else if (typeof r.ai === "string") parts.push(`AI: ${r.ai}`);
  return parts.join(" ");
}
