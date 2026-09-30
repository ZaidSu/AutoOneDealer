import type { Metadata } from "next";
import AiRepliesView from "@/components/ai/AiRepliesView";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { aiConfigured } from "@/lib/ai/claude";
import { listReplies } from "@/lib/ai/replies";
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
  const header = <PageHeader title="Email replies" description="The AI writes a reply to each new lead that has an email address. Check it, change anything you like, and click Send." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI email replies" /></>;
  const [replies, connection, lastTimer] = await fresh("AI replies", () => Promise.all([listReplies(), getGmailConnection(), getSetting("last_timer_run")]));
  return (
    <div className="max-w-5xl">
      {header}
      <AiRepliesView
        drafts={replies.drafts} history={replies.history}
        setup={{ ai: aiConfigured(), canSend: canSendFrom(connection), gmail: Boolean(connection), lastTimer: lastTimer ? Number(lastTimer) : null }}
        canWriteNow={can.editAiSettings(staff.role)}
      />
    </div>
  );
}
