import type { Metadata } from "next";
import TextsInbox from "@/components/ai/TextsInbox";
import AiOffNotice from "@/components/ai/AiOffNotice";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { channelOn } from "@/lib/ai/switches";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { listConversations } from "@/lib/sms";
import { pretty, when } from "@/lib/utils/sms-format";

export const metadata: Metadata = { title: "Text conversations" };
export const dynamic = "force-dynamic";

export default async function AiTextsPage() {
  await requirePageStaff();
  const header = <PageHeader title="Text conversations" description="Every text conversation with customers. Click a conversation to read it, send a reply, or approve the AI's draft." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Text messages" /></>;
  const [conversations, enabled] = await fresh("Texts", () => Promise.all([listConversations(), channelOn("text")]));
  const waiting = conversations.filter((c) => c.waiting).length;

  return (
    <div className="max-w-6xl">
      {header}
      {!enabled && <AiOffNotice channel="text" />}
      <section aria-labelledby="convos">
        <h2 id="convos" className="mb-3 text-lg font-semibold">Conversations {waiting > 0 && <span className="ml-1 rounded-full bg-signal px-2 py-0.5 align-middle text-xs font-semibold text-white">{waiting} waiting</span>}</h2>
        {conversations.length === 0 ? <p className="panel p-5 text-muted">No texts yet. When a customer texts the dealership number, the conversation shows up here.</p> : (
          <TextsInbox rows={conversations.map((c) => ({
            key: c.phone, customerKey: c.customerKey, phone: c.phone, name: c.name, label: c.name || pretty(c.phone),
            preview: `${c.last.direction === "out" ? (c.last.ai ? "AI: " : "You: ") : ""}${c.last.body}`.slice(0, 160), when: when(c.last.at), waiting: c.waiting, unread: c.unread,
          }))} />
        )}
      </section>
    </div>
  );
}
