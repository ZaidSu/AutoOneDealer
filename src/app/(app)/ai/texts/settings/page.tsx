import type { Metadata } from "next";
import Link from "next/link";
import AiChannelSwitch from "@/components/ai/AiChannelSwitch";
import TestTextButton from "@/components/ai/TestTextButton";
import AutoTextToggle from "@/components/ai/AutoTextToggle";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { aiConfigured } from "@/lib/ai/claude";
import { channelOn } from "@/lib/ai/switches";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import TextNewLeadsToggle from "@/components/ai/TextNewLeadsToggle";
import { getAutoText, getTextNewLeads } from "@/lib/sms";
import { twilioConfigured } from "@/lib/sms/twilio";
import { pretty } from "@/lib/utils/sms-format";

export const metadata: Metadata = { title: "Text settings" };
export const dynamic = "force-dynamic";

export default async function AiTextSettingsPage() {
  const staff = await requirePageStaff();
  const header = <PageHeader title="Text settings" description="Turn the AI on or off for texts, choose whether it texts by itself, and check that Twilio is connected." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Text settings" /></>;
  const [autoText, enabled, newLeads] = await fresh("Text settings", () => Promise.all([getAutoText(), channelOn("text"), getTextNewLeads()]));
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://auto-one-dealer.vercel.app");
  const webhook = `${base.replace(/\/$/, "")}/api/sms/incoming`;
  const ok = twilioConfigured();
  const dev = can.useDeveloperTools(staff.role);
  const canChange = can.editAiSettings(staff.role);
  const number = pretty(String(process.env.TWILIO_PHONE_NUMBER ?? "").replace(/[^\d+]/g, "").replace(/^(\d{10})$/, "+1$1")) || "Messaging Service";

  return (
    <div className="max-w-4xl">
      {header}
      <section aria-label="AI on or off" className="panel mb-6 p-5">
        <AiChannelSwitch channel="text" initial={enabled} canChange={canChange} />
      </section>
      <section aria-label="Setup" className="panel p-5">
        <ul className="grid gap-2 text-[15px]">
          <Check ok={aiConfigured()} text={aiConfigured() ? "AI is connected" : "AI key missing: add ANTHROPIC_API_KEY in Vercel"} />
          <Check ok={ok} text={ok ? `Texting number connected (${number})` : "Twilio not connected: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) in Vercel"} />
          {dev && <>
          <li className="flex items-start gap-2.5">
            <span aria-hidden className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-graphite-3/40 text-[10px] font-bold text-white">i</span>
            <span>In Twilio, set <b>A message comes in</b> (on the number, or the Messaging Service&apos;s Integration) to Webhook, HTTP POST:
              <code className="mt-1 block w-fit select-all rounded-md bg-paper px-2 py-1 text-sm">{webhook}</code></span>
          </li>
          <li className="flex items-start gap-2.5 text-muted">
            <span aria-hidden className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-graphite-3/40 text-[10px] font-bold text-white">i</span>
            <span>Texts to customers only deliver once the A2P 10DLC registration is approved in Twilio.</span>
          </li>
          </>}
        </ul>
        {dev && <div className="mt-4 border-t border-line pt-4"><TestTextButton /></div>}
        <div className="mt-4 border-t border-line pt-4"><TextNewLeadsToggle initial={newLeads} canChange={canChange} /></div>
        <div className="mt-4 border-t border-line pt-4"><AutoTextToggle initial={autoText} canChange={canChange} /></div>
      </section>
      <p className="mt-4 text-sm text-muted">The text sent a week after a purchase is set up under <Link href="/ai/automations" className="font-semibold text-signal underline">AI setup → Automations</Link>.</p>
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
