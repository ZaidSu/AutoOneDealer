import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { H2, P, UL } from "@/components/legal/LegalPage";
import { LEGAL as L } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Privacy Policy", robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <P>This policy explains how {L.dealerLegal}, doing business as {L.dealer} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), collects and uses your information when you contact us about a vehicle, apply for financing through us, text us, email us, or buy a car from us. We are a used car dealership located at {L.address}.</P>

      <H2>What we collect</H2>
      <UL>
        <li><b>Contact details</b> you give us: name, phone number, email address, and city and state.</li>
        <li><b>Your inquiry</b>: the vehicle you asked about, your message, and any trade-in details you shared.</li>
        <li><b>Messages</b> you send us by text or email, and the replies we send you.</li>
        <li><b>Financing applications</b>: when you apply for financing through a listing site such as CarsForSale.com, we get a notice with your name, phone number, city, the loan amount and down payment you entered, and the vehicle. The full application stays with that site and the lender. We do not collect your Social Security number or bank details through texts or emails, and we ask you not to send them.</li>
        <li><b>Purchase details</b>: the vehicle you bought and the date, so we can follow up with you.</li>
        <li><b>How you found us</b>: for example, which listing site your inquiry came from.</li>
      </UL>

      <H2>How we use it</H2>
      <UL>
        <li>To answer your questions about vehicles and set up visits and test drives.</li>
        <li>To text or email you about your inquiry, your appointment, or your purchase, including checking in after you buy.</li>
        <li>To keep records of our conversations and run our dealership.</li>
        <li>To meet legal and financing requirements.</li>
      </UL>
      <P>We use an automated assistant (artificial intelligence) to help write some of our texts and emails. A team member may review them, and some are sent automatically. You can always ask to talk to a person by calling us at {L.phone}.</P>

      <H2>Text messaging and your mobile number</H2>
      <P><b>We do not share your mobile phone number, or your text message opt-in and consent, with third parties or affiliates for their marketing or promotional purposes.</b> We do not sell your information. The companies that help us deliver messages (listed below) may handle your number only to provide that service to us. See our <Link className="font-semibold text-signal hover:underline" href="/sms-terms">Text Message Terms</Link> for how to stop texts.</P>

      <H2>Who handles your information for us</H2>
      <P>We use these service providers to run our business. They may process your information only on our behalf and to provide their service:</P>
      <UL>
        <li>Twilio, to send and receive text messages.</li>
        <li>Google (Gmail), to send, receive and store our emails.</li>
        <li>Anthropic, whose AI service helps write replies. Your message and the details we use to answer it are sent to it for that purpose.</li>
        <li>Supabase and Vercel, to store our records and run our software.</li>
        <li>Listing sites such as CarsForSale.com, which send us your inquiry or application notice.</li>
      </UL>
      <P>We may also disclose information when the law requires it, to protect our rights, or to complete a sale you asked for (for example, to a lender you chose).</P>

      <H2>How long we keep it</H2>
      <P>We keep customer records for as long as we need them to serve you and to meet our business, tax and legal obligations. We keep a record of anyone who opts out of texts or emails so that we honor it.</P>

      <H2>Security</H2>
      <P>We use reasonable safeguards, including sign-in controls and encrypted connections, to protect your information. No method of storage or transmission is completely secure, so we cannot guarantee absolute security. Please do not send sensitive information such as Social Security or bank account numbers by text or email.</P>

      <H2>Your choices</H2>
      <UL>
        <li>Reply <b>STOP</b> to any text, or reply &ldquo;unsubscribe&rdquo; to any email, and we will stop.</li>
        <li>You may ask us to tell you what we have about you, correct it, or delete it by contacting us below. We will respond as the law requires. We may keep information we are required to keep.</li>
      </UL>

      <H2>Children</H2>
      <P>Our services are for adults. We do not knowingly collect information from anyone under 18.</P>

      <H2>Changes</H2>
      <P>We may update this policy and will change the date at the top when we do.</P>

      <H2>Contact us</H2>
      <P>{L.dealer}, {L.address}. Phone {L.phone}. Email {L.email}.</P>
    </LegalPage>
  );
}
