import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import { displayName, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { readableBody, withGmail } from "@/lib/gmail";
import { parseLead } from "@/lib/parsers/leads";

export const metadata: Metadata = { title: "Email" };
export const dynamic = "force-dynamic";

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{8,24}$/i.test(id)) notFound();

  const result = await withGmail(async (gmail) => {
    const message = await gmail.full(id).catch(() => null);
    return message && { message, gmailUrl: gmail.gmailLink(id), mailbox: gmail.mailbox };
  });

  if (result.status !== "ok") return <GmailState {...result} />;
  if (!result.data) notFound();
  const { message, gmailUrl, mailbox } = result.data;
  const lead = parseLead({ from: message.from, subject: message.subject, text: message.text, html: message.html, mailbox });

  const rows: [string, React.ReactNode][] = lead
    ? ([
        ["Phone", lead.phone ? <a className="hover:text-signal hover:underline" href={`tel:${lead.phone}`}>{formatPhone(lead.phone)}</a> : "Not provided"],
        ["Email", lead.email ? <a className="hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : null],
        ["Location", lead.location],
        ["Vehicle", lead.vehicle],
        ["VIN", lead.vin],
        ["Stock number", lead.stock],
        ["Loan amount", lead.loanAmount !== null ? formatMoney(lead.loanAmount) : null],
        ["Down payment", lead.downPayment !== null ? formatMoney(lead.downPayment) : null],
        ["Application ID", lead.applicationId],
        ["Comments", lead.comments ? <span className="whitespace-pre-line">{lead.comments}</span> : null],
      ] as [string, React.ReactNode][]).filter(([, v]) => v !== null && v !== "")
    : [];

  return (
    <article className="max-w-3xl">
      <Link href="/inbox" className="text-sm font-semibold text-muted hover:text-ink">← Back to inbox</Link>
      <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight">{message.subject}</h1>
      <p className="mt-1 text-sm text-muted">From {message.fromName}, {formatDateTime(message.receivedAt)}</p>

      {lead && (
        <section aria-label="Lead details" className="mt-6 rounded-lg border border-line bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{displayName(lead.name)}</h2>
            <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application received" : lead.type}</Badge>
            <Badge tone="neutral">{lead.provider}</Badge>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[140px_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {lead.viewUrl && lead.kind === "application" && (
            <a href={lead.viewUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark">
              Open full application
            </a>
          )}
        </section>
      )}

      <section aria-label="Email text" className="mt-6 rounded-lg border border-line bg-white p-5">
        <pre className="font-sans whitespace-pre-wrap break-words text-[15px] leading-relaxed">{readableBody(message)}</pre>
      </section>
      <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-signal hover:underline">Open in Gmail</a>
    </article>
  );
}
