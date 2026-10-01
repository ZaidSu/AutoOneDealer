import type { Metadata } from "next";
import Link from "next/link";
import NotSetUp from "@/components/ai/NotSetUp";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";
import { toE164, twilioConfigured } from "@/lib/sms/twilio";

export const metadata: Metadata = { title: "Phone numbers" };
export const dynamic = "force-dynamic";

const pretty = (e164: string) => e164.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

export default async function PhoneNumbersPage() {
  await requirePageStaff();
  const number = toE164(process.env.TWILIO_PHONE_NUMBER);
  const header = <PageHeader title="Phone numbers" description="The number customers text, and that the AI texts them from." />;
  if (!twilioConfigured()) {
    return <>{header}<NotSetUp icon="phone" title="No texting number connected" body="Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Vercel to connect the dealership's texting number." /></>;
  }
  return (
    <div className="max-w-3xl">
      {header}
      <section className="panel overflow-hidden">
        <div aria-hidden className="h-1.5 bg-go" />
        <div className="flex flex-wrap items-center gap-5 p-6">
          <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-go-soft text-go">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-condensed text-3xl font-semibold tabular-nums">{number ? pretty(number) : "Messaging Service"}</p>
            <p className="text-sm text-muted">Texting number, connected through Twilio</p>
          </div>
          <span className="rounded-full bg-go-soft px-3 py-1 text-sm font-semibold text-go">Connected</span>
        </div>
        <ul className="grid gap-3 border-t border-line p-6 text-[15px]">
          <li><b>Texts:</b> customers text this number; conversations show on each customer&apos;s page and in <Link href="/ai/texts" className="font-semibold text-signal underline">Text messages</Link>.</li>
          <li><b>Calls:</b> calls to this number can ring the dealership (set up in Twilio with call forwarding).</li>
          <li className="text-muted">Texts to customers deliver once the carrier registration (A2P 10DLC) is approved in Twilio.</li>
        </ul>
      </section>
    </div>
  );
}
