import type { Metadata } from "next";
import AiChannelSwitch from "@/components/ai/AiChannelSwitch";
import AiRepliesView from "@/components/ai/AiRepliesView";
import ChannelSummary from "@/components/ai/ChannelSummary";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { aiConfigured } from "@/lib/ai/claude";
import { getAutoSend, listReplies, recentLeadOutcomes, replyStats } from "@/lib/ai/replies";
import { channelOn } from "@/lib/ai/switches";
import { can } from "@/lib/auth/access";
import { canSendFrom } from "@/lib/auth/google";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getSetting } from "@/lib/db/data";
import { getGmailConnection } from "@/lib/gmail/connection";

export const metadata: Metadata = { title: "AI email replies" };
export const dynamic = "force-dynamic";

export default async function AiEmailsPage() {
  const staff = await requirePageStaff();
  const state = await dbState();
  const header = <PageHeader title="Email replies" description="Everything about the AI and email: turn it on or off, check its drafts, and see what it replied to, skipped or discarded." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI email replies" /></>;
  const [replies, connection, lastTimer, autoSend, outcomes, lastReport, enabled, stats] = await fresh("AI replies", () => Promise.all([
    listReplies(), getGmailConnection(), getSetting("last_timer_run"), getAutoSend(), recentLeadOutcomes(), getSetting("last_timer_report"), channelOn("email"), replyStats(30),
  ]));
  let report: { at: number; leads: unknown; ai: unknown } | null = null;
  try { report = lastReport ? JSON.parse(lastReport) : null; } catch { /* ignore */ }
  return (
    <div className="max-w-5xl">
      {header}
      <section aria-label="Email settings" className="panel mb-8 p-5">
        <AiChannelSwitch channel="email" initial={enabled} canChange={can.editAiSettings(staff.role)} />
      </section>
      <div className="mb-8">
        <ChannelSummary title="Email summary" note="The last 30 days: what the AI did with the emails it handled."
          stats={[
            { label: "Replied", value: stats.sent, color: "#1f7a4d", sub: `${stats.sentLeads} to new leads, ${stats.sentReplies} to replies` },
            { label: "Waiting for you", value: stats.waiting, color: "#e0a100" },
            { label: "Discarded", value: stats.discarded },
            { label: "Skipped", value: stats.skipped },
            { label: "Failed", value: stats.failed, color: stats.failed ? "#c8102e" : undefined },
          ]}
          reasons={stats.reasons} />
      </div>
      <AiRepliesView
        drafts={replies.drafts} history={replies.history}
        setup={{ ai: aiConfigured(), canSend: canSendFrom(connection), gmail: Boolean(connection), lastTimer: lastTimer ? Number(lastTimer) : null }}
        canWriteNow={can.editAiSettings(staff.role)} autoSend={autoSend} outcomes={outcomes} lastReport={report ? describeReport(report) : null}
      />
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
