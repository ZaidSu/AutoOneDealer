import type { Metadata } from "next";
import ChannelSummary from "@/components/ai/ChannelSummary";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { aiTextHistory, textStats } from "@/lib/sms";
import { pretty, when } from "@/lib/utils/sms-format";

export const metadata: Metadata = { title: "Text history" };
export const dynamic = "force-dynamic";

const TEXT_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-go-soft text-go" }, delivered: { label: "Delivered", cls: "bg-go-soft text-go" }, queued: { label: "Sending", cls: "bg-paper text-muted ring-1 ring-line" },
  sending: { label: "Sending", cls: "bg-paper text-muted ring-1 ring-line" }, draft: { label: "Waiting for you", cls: "bg-[#fff3d6] text-[#8a5300]" },
  discarded: { label: "Discarded", cls: "bg-paper text-muted ring-1 ring-line" }, failed: { label: "Failed", cls: "bg-warn-soft text-signal" },
};

export default async function AiTextHistoryPage() {
  await requirePageStaff();
  const header = <PageHeader title="Text history" description="Everything the AI texted, and what happened to each text." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Text history" /></>;
  const [stats, history] = await fresh("Text history", () => Promise.all([textStats(30), aiTextHistory(100)]));
  return (
    <div className="max-w-5xl">
      {header}
      <div className="mb-8">
        <ChannelSummary title="Summary" note="The last 30 days."
          stats={[
            { label: "Texts received", value: stats.received },
            { label: "AI texts sent", value: stats.aiSent, color: "#1f7a4d" },
            { label: "Sent by your team", value: stats.staffSent },
            { label: "AI drafts waiting", value: stats.waiting, color: "#e0a100" },
            { label: "Discarded", value: stats.discarded },
            { label: "Failed", value: stats.failed, color: stats.failed ? "#c8102e" : undefined, sub: stats.optedOut ? `${stats.optedOut} replied STOP` : undefined },
          ]} />
      </div>
      <section aria-labelledby="ai-history">
        <h2 id="ai-history" className="mb-3 text-lg font-semibold">What the AI texted</h2>
        {history.length === 0 ? <p className="panel p-5 text-muted">The AI hasn&apos;t written any texts yet.</p> : (
          <ul className="panel divide-y divide-line">
            {history.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3">
                <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TEXT_STATUS[m.status]?.cls ?? ""}`}>{TEXT_STATUS[m.status]?.label ?? m.status}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name || pretty(m.phone)}</p>
                  <p className="text-[15px]">{m.body}</p>
                  {m.error && <p className="text-sm text-signal">{m.error}</p>}
                </div>
                <span className="text-sm text-muted">{when(m.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
