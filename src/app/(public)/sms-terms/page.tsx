import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { H2, P, UL } from "@/components/legal/LegalPage";
import { LEGAL as L } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Text Message Terms", robots: { index: true, follow: true } };

export default function SmsTermsPage() {
  return (
    <LegalPage title="Text Message Terms">
      <P><b>Program name:</b> {L.dealer} Customer Texts. <b>Sender:</b> {L.dealerLegal}, doing business as {L.dealer}, {L.address}.</P>

      <H2>What you will get</H2>
      <P>Text messages from {L.dealer} about a vehicle you asked about or bought: answers to your questions, appointment confirmations and reminders, availability updates, and a check-in after your purchase. We do not send promotional blasts or send your number to anyone to market to you.</P>

      <H2>How you agree</H2>
      <P>You agree to receive these texts when you (1) sign up on our <Link className="font-semibold text-signal hover:underline" href="/text-updates">text updates page</Link> by entering your mobile number and checking the agreement box, (2) submit an inquiry or finance application on {L.website} or on CarsForSale.com and give us your phone number, (3) text our number first, or (4) agree on our sales paperwork when you buy a car. Consent to receive texts is <b>not a condition of buying anything</b> from us.</P>

      <H2>Message frequency and cost</H2>
      <P>Message frequency varies. Usually it is a few messages around your inquiry, visit or purchase. <b>Message and data rates may apply</b>, according to your mobile plan.</P>

      <H2>Stop and help</H2>
      <UL>
        <li>To stop getting texts, reply <b>STOP</b> (you can also use CANCEL, QUIT, END, UNSUBSCRIBE, STOPALL, REVOKE or OPTOUT). You will get one confirmation and no more texts. To start again, reply <b>START</b>.</li>
        <li>For help, reply <b>HELP</b>, call {L.phone}, or email {L.email}.</li>
      </UL>

      <H2>Automated assistant</H2>
      <P>Some of our texts are written with the help of an automated assistant (artificial intelligence), and some are sent automatically. You can ask for a person at any time by calling {L.phone}. Texts are for general information. Prices, availability, financing and any commitments are only confirmed by our team and in writing.</P>

      <H2>Carriers and eligibility</H2>
      <P>This program is for U.S. mobile numbers and people 18 or older. Carriers are not liable for delayed or undelivered messages. Delivery depends on your carrier and device.</P>

      <H2>Your privacy</H2>
      <P>We do not share your mobile number or text opt-in with third parties or affiliates for marketing. See our <Link className="font-semibold text-signal hover:underline" href="/privacy">Privacy Policy</Link>.</P>

      <H2>Contact us</H2>
      <P>{L.dealer}, {L.address}. Phone {L.phone}. Email {L.email}.</P>
    </LegalPage>
  );
}
