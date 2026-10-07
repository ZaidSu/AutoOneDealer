import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { H2, P, UL } from "@/components/legal/LegalPage";
import TextSignupForm from "@/components/legal/TextSignupForm";
import { LEGAL as L, SMS_CONSENT_TEXT } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Get text updates", robots: { index: true, follow: true } };

export default function TextUpdatesPage() {
  return (
    <LegalPage title="Get text updates from Auto One Motors">
      <P>Want us to text you instead of calling? Sign up below and we&apos;ll text you about the car you asked about: answers to your questions, appointment reminders, and a quick check-in after you buy.</P>
      <UL>
        <li><b>What you&apos;ll get:</b> texts about your vehicle inquiry or purchase from {L.dealer}. No mass marketing blasts, and we never sell or share your number.</li>
        <li><b>How often:</b> message frequency varies, usually just a few texts around your visit or purchase. Message and data rates may apply.</li>
        <li><b>Stop any time:</b> reply <b>STOP</b>. For help, reply <b>HELP</b> or call {L.phone}.</li>
      </UL>
      <TextSignupForm consentText={SMS_CONSENT_TEXT} phone={L.phone} />
      <H2>More information</H2>
      <P>Read our <Link href="/sms-terms" className="font-semibold text-signal underline">Text Message Terms</Link> and <Link href="/privacy" className="font-semibold text-signal underline">Privacy Policy</Link>. You can also ask us to start or stop texts by calling {L.phone}. {L.dealerLegal}, {L.address}.</P>
    </LegalPage>
  );
}
