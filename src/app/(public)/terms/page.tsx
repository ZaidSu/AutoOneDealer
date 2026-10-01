import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Caps, H2, P, UL } from "@/components/legal/LegalPage";
import { DEFAULT_BILLING as B, money } from "@/lib/billing/types";
import { LEGAL as L } from "@/lib/legal/config";

export const metadata: Metadata = { title: "AutoDash Service Agreement", robots: { index: true, follow: true } };

export default function ServiceAgreementPage() {
  const provider = L.provider;
  const customer = L.dealerLegal;
  return (
    <LegalPage title="AutoDash Service Agreement" brand="AutoDash">
      <P>This agreement is between <b>{provider}</b> (&ldquo;Provider&rdquo;, &ldquo;we&rdquo;) and <b>{customer}</b>, doing business as {L.dealer} (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;). It covers AutoDash, the software we provide to you. It takes effect when an owner of Customer accepts it in AutoDash (Billing page), signs a copy, or accepts in writing, or when Customer first uses AutoDash after receiving it, whichever happens first (version {L.agreementVersion}).</P>

      <H2>1. The service</H2>
      <P>AutoDash collects the leads and emails that reach the Customer&rsquo;s dealership mailbox, keeps customer records, appointments and analytics, and provides AI-assisted email replies and text messaging, hosting, a database and backups, and support (together, the &ldquo;Service&rdquo;). We may improve, change or replace parts of the Service. We will try to give notice of changes that remove a feature you rely on.</P>

      <H2>2. Fees and billing</H2>
      <UL>
        <li><b>Monthly fee:</b> {money(B.monthlyCents)} per month, plus a <b>one-time connection fee of {money(B.setupFeeCents)}</b>.</li>
        <li><b>Included usage:</b> up to {B.includedEmails.toLocaleString("en-US")} AI emails and {B.includedTexts.toLocaleString("en-US")} AI texts each month. Usage above that is billed at {B.extraEmailCents}&cent; per email and {B.extraTextCents}&cent; per text, as shown on the Billing page and on each bill.</li>
        <li><b>Taxes:</b> plus sales tax where it applies, calculated and shown on each bill.</li>
        <li><b>Billed by:</b> {provider}. A bill is created each month and is due on the <b>{B.dueDay}th</b>.</li>
        <li><b>Payment:</b> by credit or debit card through Stripe. Customer authorizes us to charge the card it saves for each bill on its due date (autopay) and to retry a failed payment. Card numbers are handled by Stripe and never stored by AutoDash.</li>
        <li><b>Past due:</b> if a bill is not paid by 3 days after its due date, we may lock or suspend access to the Service until it is paid. Past-due amounts remain owed. You will not be charged a separate late fee.</li>
        <li><b>Price changes:</b> we may change prices with at least 30 days&rsquo; notice, effective on the next bill. If you do not agree, you may cancel before the change takes effect.</li>
        <li><b>Disputes about a bill:</b> contact us in writing within 30 days of the bill, and before disputing the charge with your card company, so we can fix any mistake. Bills not disputed in 30 days are treated as correct.</li>
        <li><b>No refunds:</b> the connection fee and fees for a month already started are non-refundable, except where the law requires otherwise.</li>
      </UL>

      <H2>3. Term and cancellation</H2>
      <P>The Service renews month to month. Either of us may cancel at any time by written notice (email is fine). Cancellation takes effect at the end of the month in which the notice is given, and Customer stays responsible for fees through that date. We may suspend or end the Service immediately if Customer breaks this agreement, does not pay, or uses the Service unlawfully or in a way that risks our accounts with third-party providers.</P>

      <H2>4. How the AI works, and what Customer is responsible for</H2>
      <P>The AI writes emails and texts using the information and instructions Customer provides. <b>AI can be wrong.</b> It may give inaccurate details about a vehicle, price, availability, hours or financing. By default a person at the Customer approves each AI email before it sends. Customer may choose to switch on automatic sending of emails and texts. <b>If Customer turns automatic sending on, Customer accepts responsibility for everything the AI sends in its name.</b> Customer agrees to:</P>
      <UL>
        <li>give the AI accurate dealership information and instructions, and keep them up to date;</li>
        <li>review AI drafts, texts and conversations regularly, and correct mistakes with the customer promptly;</li>
        <li>make sure no one relies on the AI for prices, financing approvals, rates, trade-in values or other commitments, which only Customer&rsquo;s staff may make;</li>
        <li>get and keep proof of every person&rsquo;s consent to be texted and emailed, honor STOP and unsubscribe requests, and follow all laws that apply to its messages and sales, including the Telephone Consumer Protection Act (TCPA), the CAN-SPAM Act, carrier rules (including A2P 10DLC), the FTC Safeguards Rule and Texas law; and</li>
        <li>use the Service only to contact people who have a real connection to the dealership.</li>
      </UL>
      <P>Customer is the sender and decides who is messaged, what is said and when. The Service is a tool and not legal, financial or compliance advice. We are not a law firm.</P>

      <H2>5. Third-party services</H2>
      <P>The Service depends on providers we do not control, including Google (Gmail), Twilio and mobile carriers, Anthropic, Stripe, Supabase, Vercel and listing sites such as CarsForSale.com. Their outages, rule changes, price changes, account decisions or message-blocking can affect the Service. Registration of texting numbers (A2P 10DLC) is approved by carriers and Twilio, not by us, and we do not promise approval or delivery. We are not responsible for those providers or their acts. Customer must follow their terms.</P>

      <H2>6. Customer data</H2>
      <UL>
        <li>The customer and lead information in AutoDash belongs to Customer. We use it only to provide, secure and improve the Service and as the law requires.</li>
        <li>We use reasonable safeguards, but no system is perfectly secure. We will tell Customer promptly if we learn that Customer&rsquo;s data was improperly accessed.</li>
        <li>On request, we will give Customer an export of its data. After the Service ends, we may delete Customer&rsquo;s data after 60 days unless the law requires us to keep it.</li>
        <li>Customer is responsible for the lawfulness of the information it puts in the Service and for who it lets sign in.</li>
      </UL>

      <H2>7. No guarantees</H2>
      <Caps>The service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent the law allows, provider disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement. Provider does not promise that the service will be uninterrupted or error-free, that messages will be delivered, that AI output will be accurate, or that Customer will get any number of leads, sales or any other result.</Caps>

      <H2>8. Limits on liability</H2>
      <Caps>To the fullest extent the law allows, provider will not be liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for lost profits, lost sales, lost data or loss of goodwill, even if told they were possible. This includes anything arising from AI output, a late, blocked or missed message or lead, an outage, or acts of third-party providers or Customer&rsquo;s own staff.</Caps>
      <Caps>Provider&rsquo;s total liability for all claims relating to the service or this agreement will not exceed the fees Customer paid to provider in the three (3) months before the event that caused the claim. These limits apply to claims of any kind, including negligence of provider, to the extent the law allows. Customer agrees these limits are part of the price it pays for the service.</Caps>

      <H2>9. Customer&rsquo;s responsibility for its messages and sales</H2>
      <Caps>Customer will defend, indemnify and hold provider and its owners, employees and contractors harmless from claims, penalties, damages and costs (including reasonable attorneys&rsquo; fees) arising from: (a) messages and emails sent in Customer&rsquo;s name, including claims about lack of consent, the TCPA, CAN-SPAM or carrier rules; (b) content and instructions Customer gave the AI, or anything the AI sent that Customer approved or allowed to send automatically; (c) Customer&rsquo;s vehicles, prices, advertising, financing and sales, and its dealings with its customers; and (d) Customer&rsquo;s breach of this agreement. This applies even if provider&rsquo;s own ordinary negligence contributed to the claim, except for provider&rsquo;s gross negligence or willful misconduct.</Caps>

      <H2>10. Settling disagreements</H2>
      <UL>
        <li>If there is a disagreement, the person raising it will send a written notice describing it, and we will talk in good faith for at least 30 days before anyone starts a lawsuit.</li>
        <li>Texas law governs this agreement. Any lawsuit must be brought in the state or federal courts in or for {L.county}, and both of us agree to those courts.</li>
        <li>The side that wins a lawsuit about this agreement may recover its reasonable attorneys&rsquo; fees and costs from the other.</li>
        <li>Neither of us may bring a claim about this agreement more than one (1) year after it arose, to the extent the law allows.</li>
      </UL>

      <H2>11. General</H2>
      <UL>
        <li><b>Whole agreement.</b> This is the whole agreement about AutoDash and replaces earlier discussions. A change must be in writing, except that we may update this agreement with 30 days&rsquo; notice and Customer&rsquo;s continued use or acceptance after that counts as agreement.</li>
        <li><b>Separate businesses.</b> We are independent contractors, not partners, employees or agents of each other.</li>
        <li><b>If part is invalid</b> the rest stays in force. Not enforcing a right now does not give it up. Customer may not transfer this agreement without our written consent. We may transfer it to a successor business.</li>
        <li><b>Events beyond our control</b> (such as outages of internet, power or third-party services, and acts of government) excuse delay. Payment obligations still apply.</li>
        <li><b>Notices.</b> Notices to Customer go to the email on its AutoDash account, and notices to Provider go to {L.providerEmail || "the contact email on the bill"}. Email counts as written notice.</li>
        <li><b>Electronic acceptance.</b> A click-to-accept in AutoDash, which records who accepted it, the time and the version, is a legally binding signature to the extent the law allows.</li>
      </UL>

      <H2>Contact</H2>
      <P>{provider}{L.providerEmail ? `, ${L.providerEmail}` : ""}. For the dealership&rsquo;s customer texts and emails, see the <Link className="font-semibold text-signal hover:underline" href="/privacy">Privacy Policy</Link>, <Link className="font-semibold text-signal hover:underline" href="/sms-terms">Text Message Terms</Link> and <Link className="font-semibold text-signal hover:underline" href="/email-terms">Email Terms</Link>.</P>

      <div className="mt-10 rounded-lg border border-line bg-white p-5 text-[15px]">
        <p className="font-semibold">Signed copy (optional, in addition to accepting in AutoDash)</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div><p className="font-semibold">{provider}</p><p className="mt-6 border-t border-ink pt-1 text-sm text-muted">Signature / Printed name / Date</p></div>
          <div><p className="font-semibold">{customer}</p><p className="mt-6 border-t border-ink pt-1 text-sm text-muted">Signature / Printed name / Title / Date</p></div>
        </div>
      </div>
    </LegalPage>
  );
}
