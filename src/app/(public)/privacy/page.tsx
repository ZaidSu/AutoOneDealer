import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Callout, H2, P, UL } from "@/components/site/LegalPage";
import { SITE } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Marketplace Wholesale LLC collects, uses and protects information, including phone numbers and text messages.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2, 2026">
      <P>This policy explains how {SITE.company} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses and protects information through our website and the software we provide to our business clients, including email and text messaging (SMS) features.</P>

      <H2>Information we collect</H2>
      <UL>
        <li><strong>Contact details you give us,</strong> such as your name, business name, email address and phone number, when you contact us or use our services.</li>
        <li><strong>Customer information our clients store</strong> in software we build for them, such as inquiries from their customers, appointments and messages. Our clients control this information; we process it on their behalf.</li>
        <li><strong>Messages</strong> sent and received through our software, including emails and text messages, so they can be delivered, shown to our client&rsquo;s team and kept as a record.</li>
        <li><strong>Sign-in details.</strong> If you sign in with Google, we receive your name and email address from Google so we can identify your account. We do not receive your Google password, and signing in does not give us access to your Gmail, contacts or other Google data.</li>
        <li><strong>Basic technical information</strong> such as browser type and pages visited, used to keep our website and software working and secure.</li>
      </UL>

      <H2>How we use information</H2>
      <UL>
        <li>To provide, run, support and improve our services.</li>
        <li>To respond to inquiries and communicate about our services.</li>
        <li>To send and receive messages on behalf of our clients, such as replies to a customer&rsquo;s vehicle inquiry or appointment reminders.</li>
        <li>To keep our services secure and meet legal requirements.</li>
      </UL>

      <H2 id="sms">Text messaging (SMS) and mobile information</H2>
      <Callout>
        <p><strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> Text messaging originator opt-in data and consent will not be shared with any third parties. Information may be shared only with service providers that deliver messages for us (for example, our messaging provider), and only to deliver those messages.</p>
      </Callout>
      <P>Phone numbers are used only to communicate with customers who reached out to the business or agreed to be contacted. You can stop text messages at any time by replying <strong>STOP</strong>, and get help by replying <strong>HELP</strong>. Message frequency varies. Message and data rates may apply. See our <Link href="/terms#sms" className="underline">SMS Terms</Link>.</P>

      <H2>How we share information</H2>
      <P>We do not sell personal information. We share it only with service providers that help us run our services (such as hosting, database, email, messaging, AI and payment providers), under agreements that limit their use to providing those services; with the business client the information belongs to; or when required by law.</P>

      <H2>AI features</H2>
      <P>Some features use artificial intelligence to draft replies or summaries. Information is sent to our AI provider only to produce those results, and our clients can review AI-written messages before they are sent.</P>

      <H2>How long we keep information</H2>
      <P>We keep information as long as needed to provide our services to the client it belongs to, or as required by law, and then delete it.</P>

      <H2>Security</H2>
      <P>We use reasonable safeguards, including encrypted connections and limited access. No system is perfectly secure, but we work to protect your information.</P>

      <H2>Your choices</H2>
      <P>You can ask to see, correct or delete your information by emailing us. If your information is held by one of our business clients, we will help them respond to your request.</P>

      <H2>Children</H2>
      <P>Our services are for businesses and are not directed to children under 13.</P>

      <H2>Changes</H2>
      <P>We may update this policy. The date at the top shows when it last changed.</P>

      <H2>Contact</H2>
      <P>{SITE.company}, {SITE.location}. Email: <a href={`mailto:${SITE.email}`} className="underline">{SITE.email}</a></P>
    </LegalPage>
  );
}
