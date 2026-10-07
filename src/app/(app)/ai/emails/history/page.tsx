import type { Metadata } from "next";
import { EmailHistoryView } from "@/components/ai/AiRepliesView";
import ChannelSummary from "@/components/ai/ChannelSummary";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { listReplies, replyStats } from "@/lib/ai/replies";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "Email history" };
export const dynamic = "force-dynamic";

export default async function AiEmailHistoryPage() {
  await requirePageStaff();
  const header = <PageHeader title="Email history" description="Everything the AI did with emails: what it replied to, and what it skipped, discarded or couldn't send." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI email history" /></>;
  const [replies, stats] = await fresh("AI email history", () => Promise.all([listReplies(), replyStats(30)]));
  return (
    <div className="max-w-5xl">
      {header}
      <div className="mb-8">
        <ChannelSummary title="Summary" note="The last 30 days."
          stats={[
            { label: "Replied", value: stats.sent, color: "#1f7a4d", sub: `${stats.sentLeads} to new leads, ${stats.sentReplies} to replies` },
            { label: "Waiting for you", value: stats.waiting, color: "#e0a100" },
            { label: "Discarded", value: stats.discarded },
            { label: "Skipped", value: stats.skipped },
            { label: "Failed", value: stats.failed, color: stats.failed ? "#c8102e" : undefined },
          ]}
          reasons={stats.reasons} />
      </div>
      <section aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-semibold">History</h2>
        <EmailHistoryView history={replies.history} />
      </section>
    </div>
  );
}
