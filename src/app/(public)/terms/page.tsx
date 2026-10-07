import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Callout, H2, P, UL } from "@/components/site/LegalPage";
import { SITE } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service and SMS Terms for Marketplace Wholesale LLC.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 1, 2026">
      <P>These terms apply to the website of {SITE.company} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) and the software and services we provide. By using them you agree to these terms. A signed agreement with a client takes priority over these terms where they differ.</P>

      <H2>Our services</H2>
      <P>We provide custom software, AI-assisted email and text messaging tools, websites, hosting and related support to businesses, as described in each client&rsquo;s agreement or order.</P>

      <H2>Accounts and acceptable use</H2>
      <UL>
        <li>Keep your login details private and tell us about any unauthorized use.</li>
        <li>Use our services only for lawful purposes. Do not use them to send spam, harass anyone, or message people who have not agreed to be contacted or who have opted out.</li>
        <li>Clients are responsible for the content they send and for having permission to contact their customers.</li>
      </UL>

      <H2>Fees and payment</H2>
      <P>Prices, any setup fees and taxes are listed in the client&rsquo;s agreement or billing page. Monthly fees are billed in advance and are due on the date shown on each bill. Unpaid bills may lead to services being paused.</P>

      <H2>AI-generated content</H2>
      <P>AI features may produce drafts that contain mistakes. Clients should review AI-written messages before sending them, unless they choose to turn on automatic sending, in which case they accept responsibility for those messages.</P>

      <H2>Ownership</H2>
      <P>Clients own their data. We own our software, tools and know-how, and grant clients the right to use the services during their subscription.</P>

      <H2>Availability</H2>
      <P>We work to keep our services available and fast, but they are provided &ldquo;as is&rdquo; and may occasionally be interrupted for maintenance or reasons outside our control.</P>

      <H2>Limitation of liability</H2>
      <P>To the extent allowed by law, we are not liable for indirect or consequential damages, and our total liability is limited to the fees paid to us in the three months before the claim.</P>

      <H2>Ending service</H2>
      <P>Either side may end service as described in the client&rsquo;s agreement. On request, we will help export the client&rsquo;s data.</P>

      <H2 id="sms">SMS Terms</H2>
      <Callout>
        <p><strong>Program:</strong> Businesses that use our software, such as car dealerships, may text customers who contacted them, for example to answer a question about a vehicle or to confirm or remind them of an appointment.</p>
        <p><strong>Opt out:</strong> Reply <strong>STOP</strong> at any time to stop receiving messages. You will receive one final message confirming you have been unsubscribed.</p>
        <p><strong>Help:</strong> Reply <strong>HELP</strong> for help, or email <a href={`mailto:${SITE.email}`} className="underline">{SITE.email}</a>.</p>
        <p><strong>Frequency and rates:</strong> Message frequency varies. Message and data rates may apply.</p>
        <p><strong>Carriers</strong> are not liable for delayed or undelivered messages.</p>
        <p><strong>Privacy:</strong> See our <Link href="/privacy#sms" className="underline">Privacy Policy</Link>. Mobile information is not shared with third parties or affiliates for marketing or promotional purposes.</p>
      </Callout>

      <H2>Governing law</H2>
      <P>These terms are governed by the laws of the State of Texas.</P>

      <H2>Changes</H2>
      <P>We may update these terms. The date at the top shows when they last changed.</P>

      <H2>Contact</H2>
      <P>{SITE.company}, {SITE.location}. Email: <a href={`mailto:${SITE.email}`} className="underline">{SITE.email}</a></P>
    </LegalPage>
  );
}
