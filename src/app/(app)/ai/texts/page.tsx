import type { Metadata } from "next";
import Link from "next/link";
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
  const header = <PageHeader title="Text conversations" description="Every text conversation with customers. Open one to read it, send a reply, or approve the AI's draft." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Text messages" /></>;
  const [conversations, enabled] = await fresh("Texts", () => Promise.all([listConversations(), channelOn("text")]));
  const waiting = conversations.filter((c) => c.waiting).length;

  return (
    <div className="max-w-5xl">
      {header}
      {!enabled && <AiOffNotice channel="text" />}
      <section aria-labelledby="convos">
        <h2 id="convos" className="mb-3 text-lg font-semibold">Conversations {waiting > 0 && <span className="ml-1 rounded-full bg-signal px-2 py-0.5 align-middle text-xs font-semibold text-white">{waiting} waiting</span>}</h2>
        {conversations.length === 0 ? <p className="panel p-5 text-muted">No texts yet. When a customer texts the dealership number, the conversation shows up here.</p> : (
          <ul className="panel divide-y divide-line">
            {conversations.map((c) => (
              <li key={c.phone}>
                <Link href={c.customerKey ? `/customers/${encodeURIComponent(c.customerKey)}#texts` : "#"} className="flex items-center gap-4 px-5 py-3.5 hover:bg-paper/60">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-graphite font-semibold text-white">{(c.name ?? "#").slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{c.name || pretty(c.phone)}</span>
                      {c.waiting && <span className="rounded-full bg-[#fff4e3] px-2 py-0.5 text-xs font-semibold text-[#8a5300]">AI reply waiting</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">{c.last.direction === "out" ? (c.last.ai ? "AI: " : "You: ") : ""}{c.last.body}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted">{when(c.last.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
