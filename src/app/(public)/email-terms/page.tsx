import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { H2, P, UL } from "@/components/legal/LegalPage";
import { LEGAL as L } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Email Terms", robots: { index: true, follow: true } };

export default function EmailTermsPage() {
  return (
    <LegalPage title="Email Terms">
      <H2>Who emails you</H2>
      <P>Emails from {L.dealer} ({L.dealerLegal}, {L.address}) are sent from our dealership mailbox. We email people who contacted us about a vehicle, applied for financing through us, or bought from us, and we reply to their questions.</P>

      <H2>What the emails are</H2>
      <UL>
        <li>Replies to your inquiry, vehicle information, appointment details, and follow-ups after a visit or purchase.</li>
        <li>We do not send mass marketing newsletters or sell or rent our email lists.</li>
      </UL>

      <H2>Automated assistant</H2>
      <P>Some of our emails are written with the help of an automated assistant (artificial intelligence) and reviewed by our team, and some may be sent automatically. If you would rather talk to a person, call {L.phone}. Prices, availability, financing and any commitments are only confirmed by our team and in writing.</P>

      <H2>How to unsubscribe</H2>
      <P>Reply to any of our emails with the word <b>unsubscribe</b> (or &ldquo;stop&rdquo;) and we will stop emailing you. We honor requests promptly and no later than 10 business days. You can also call {L.phone} or email {L.email}. Even after you unsubscribe, we may send messages that are required by law or about a transaction you started.</P>

      <H2>Please don&apos;t send sensitive information</H2>
      <P>Email is not a secure way to send Social Security numbers, bank account numbers or other sensitive data. Please do not include them in emails or texts.</P>

      <H2>Your privacy</H2>
      <P>See our <Link className="font-semibold text-signal hover:underline" href="/privacy">Privacy Policy</Link> and <Link className="font-semibold text-signal hover:underline" href="/sms-terms">Text Message Terms</Link>.</P>

      <H2>Contact us</H2>
      <P>{L.dealer}, {L.address}. Phone {L.phone}. Email {L.email}.</P>
    </LegalPage>
  );
}
