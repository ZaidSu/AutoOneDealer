import type { Metadata } from "next";
import AiOffNotice from "@/components/ai/AiOffNotice";
import AiRepliesView from "@/components/ai/AiRepliesView";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { listReplies, recentLeadOutcomes } from "@/lib/ai/replies";
import { channelOn } from "@/lib/ai/switches";
import { canSendFrom } from "@/lib/auth/google";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getGmailConnection } from "@/lib/gmail/connection";

export const metadata: Metadata = { title: "Email replies" };
export const dynamic = "force-dynamic";

export default async function AiEmailRepliesPage() {
  await requirePageStaff();
  const header = <PageHeader title="Email replies" description="The AI's replies to new leads that are waiting for you to check and send, and what it did with each recent lead." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI email replies" /></>;
  const [replies, connection, outcomes, enabled] = await fresh("AI replies", () => Promise.all([listReplies(), getGmailConnection(), recentLeadOutcomes(), channelOn("email")]));
  return (
    <div className="max-w-5xl">
      {header}
      {!enabled && <AiOffNotice channel="email" />}
      <AiRepliesView drafts={replies.drafts} canSend={canSendFrom(connection)} outcomes={outcomes} />
    </div>
  );
}
