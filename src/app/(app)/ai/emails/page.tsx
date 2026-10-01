import type { Metadata } from "next";
import AiRepliesView from "@/components/ai/AiRepliesView";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { aiConfigured } from "@/lib/ai/claude";
import { getAutoSend, listReplies, recentLeadOutcomes } from "@/lib/ai/replies";
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
  const header = <PageHeader title="Email replies" description="The AI writes a reply to each new lead that has an email address. With automatic sending off, check it, change anything, and click Send." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI email replies" /></>;
  const [replies, connection, lastTimer, autoSend, outcomes, lastReport] = await fresh("AI replies", () => Promise.all([
    listReplies(), getGmailConnection(), getSetting("last_timer_run"), getAutoSend(), recentLeadOutcomes(), getSetting("last_timer_report"),
  ]));
  let report: { at: number; leads: unknown; ai: unknown } | null = null;
  try { report = lastReport ? JSON.parse(lastReport) : null; } catch { /* ignore */ }
  return (
    <div className="max-w-5xl">
      {header}
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
