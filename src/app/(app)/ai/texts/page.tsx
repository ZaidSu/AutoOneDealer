import type { Metadata } from "next";
import Link from "next/link";
import AutoTextToggle from "@/components/ai/AutoTextToggle";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { aiConfigured } from "@/lib/ai/claude";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getAutoText, listConversations } from "@/lib/sms";
import { twilioConfigured } from "@/lib/sms/twilio";

export const metadata: Metadata = { title: "AI text messages" };
export const dynamic = "force-dynamic";

const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const pretty = (e164: string) => e164.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

export default async function AiTextsPage() {
  const staff = await requirePageStaff();
  const header = <PageHeader title="Text messages" description="Every text conversation with customers. The AI answers customer texts; open a conversation to see it all, send a reply, or approve the AI's draft." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Text messages" /></>;
  const [conversations, autoText] = await fresh("Texts", () => Promise.all([listConversations(), getAutoText()]));
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://auto-one-dealer.vercel.app");
  const webhook = `${base.replace(/\/$/, "")}/api/sms/incoming`;
  const ok = twilioConfigured();
  const waiting = conversations.filter((c) => c.waiting).length;

  return (
    <div className="max-w-5xl">
      {header}
      <section aria-label="Setup" className="panel p-5">
        <ul className="grid gap-2 text-[15px]">
          <Check ok={aiConfigured()} text={aiConfigured() ? "AI is connected" : "AI key missing: add ANTHROPIC_API_KEY in Vercel"} />
          <Check ok={ok} text={ok ? `Texting number connected (${pretty(String(process.env.TWILIO_PHONE_NUMBER ?? "").replace(/[^\d+]/g, "").replace(/^(\d{10})$/, "+1$1")) || "Messaging Service"})` : "Twilio not connected: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Vercel"} />
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-graphite-3/40 text-[10px] font-bold text-white">i</span>
            <span>In Twilio, set <b>A message comes in</b> (on the number, or the Messaging Service&apos;s Integration) to Webhook, HTTP POST:
              <code className="mt-1 block w-fit select-all rounded-md bg-paper px-2 py-1 text-sm">{webhook}</code></span>
          </li>
          <li className="flex items-start gap-2.5 text-muted">
            <span aria-hidden className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-graphite-3/40 text-[10px] font-bold text-white">i</span>
            <span>Texts to customers only deliver once the A2P 10DLC registration is approved in Twilio.</span>
          </li>
        </ul>
        <div className="mt-4 border-t border-line pt-4"><AutoTextToggle initial={autoText} canChange={can.editAiSettings(staff.role)} /></div>
      </section>

      <section aria-labelledby="convos" className="mt-8">
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

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${ok ? "bg-go" : "bg-lane"}`}>{ok ? "✓" : "!"}</span>
      <span>{text}</span>
    </li>
  );
}
