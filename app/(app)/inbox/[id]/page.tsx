import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import { displayName, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { readableBody, withGmail } from "@/lib/gmail";
import { classifyCfs, parseFinanceApplication, parseWebsiteLead } from "@/lib/parsers/carsforsale";

export const metadata: Metadata = { title: "Email" };
export const dynamic = "force-dynamic";

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{8,24}$/i.test(id)) notFound();

  const result = await withGmail(async (gmail) => {
    const message = await gmail.full(id).catch(() => null);
    return message && { message, gmailUrl: gmail.gmailLink(id) };
  });

  if (result.status !== "ok") return <GmailState status={result.status} />;
  if (!result.data) notFound();
  const { message, gmailUrl } = result.data;
  const kind = classifyCfs(message.from, message.subject);
  const app = kind === "finance_application" ? parseFinanceApplication(message.html || message.text) : null;
  const lead = kind === "website_lead" ? parseWebsiteLead(message.html || message.text) : null;
  const contact = app ?? lead;

  return (
    <article className="max-w-3xl">
      <Link href="/inbox" className="text-sm font-semibold text-muted hover:text-ink">← Back to inbox</Link>
      <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight">{message.subject}</h1>
      <p className="mt-1 text-sm text-muted">
        From {message.fromName}, {formatDateTime(message.receivedAt)}
      </p>

      {contact && (
        <section aria-label="Lead details" className="mt-6 rounded-lg border border-line bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{displayName(contact.name)}</h2>
            <Badge tone={app ? "application" : "inquiry"}>{app ? "Credit application received" : "Website inquiry"}</Badge>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[140px_1fr]">
            <dt className="text-muted">Phone</dt>
            <dd>{contact.phone ? <a className="hover:text-signal hover:underline" href={`tel:${contact.phone}`}>{formatPhone(contact.phone)}</a> : "Not provided"}</dd>
            {contact.email && (<><dt className="text-muted">Email</dt><dd><a className="hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a></dd></>)}
            {contact.location && (<><dt className="text-muted">Location</dt><dd>{contact.location}</dd></>)}
            {app && (<><dt className="text-muted">Loan amount</dt><dd>{formatMoney(app.loanAmount)}</dd><dt className="text-muted">Down payment</dt><dd>{formatMoney(app.downPayment)}</dd><dt className="text-muted">Application ID</dt><dd>{app.applicationId ?? "Not provided"}</dd></>)}
            {lead?.comments && (<><dt className="text-muted">Comments</dt><dd className="whitespace-pre-line">{lead.comments}</dd></>)}
          </dl>
          {app?.viewUrl && (
            <a href={app.viewUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark">
              Open full application in CarsForSale
            </a>
          )}
        </section>
      )}

      <section aria-label="Email text" className="mt-6 rounded-lg border border-line bg-white p-5">
        <pre className="font-sans whitespace-pre-wrap break-words text-[15px] leading-relaxed">{readableBody(message)}</pre>
      </section>
      <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-signal hover:underline">
        Open in Gmail
      </a>
    </article>
  );
}
