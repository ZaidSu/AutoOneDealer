import Link from "next/link";
import Badge from "@/components/leads/Badge";
import { displayName, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import type { Lead } from "@/lib/gmail";

export default function LeadList({ leads }: { leads: Lead[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
      {leads.map((lead) => {
        const details =
          lead.kind === "application"
            ? [lead.loanAmount !== null && `Loan ${formatMoney(lead.loanAmount)}`, lead.downPayment !== null && `Down ${formatMoney(lead.downPayment)}`, lead.location]
            : [lead.vehicle, lead.location];
        return (
          <li key={lead.messageId} className="grid gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/inbox/${lead.messageId}`} className="font-semibold hover:text-signal hover:underline">
                  {displayName(lead.name)}
                </Link>
                <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application" : lead.type}</Badge>
                <Badge tone="neutral">{lead.provider}</Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">{details.filter(Boolean).join(" · ") || lead.subject}</p>
            </div>
            <div className="min-w-0 text-[15px]">
              {lead.phone && <a className="block hover:text-signal hover:underline" href={`tel:${lead.phone}`}>{formatPhone(lead.phone)}</a>}
              {lead.email && <a className="block truncate text-sm text-muted hover:text-ink hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
              {!lead.phone && !lead.email && <span className="text-sm text-muted">No contact details found</span>}
            </div>
            <div className="flex items-center gap-4 text-sm md:justify-end">
              <span className="whitespace-nowrap text-muted">{formatDateTime(lead.receivedAt)}</span>
              {lead.viewUrl && lead.kind === "application" && (
                <a className="whitespace-nowrap font-semibold text-signal hover:underline" href={lead.viewUrl} target="_blank" rel="noopener noreferrer">
                  Full application
                </a>
              )}
              <Link className="font-semibold text-signal hover:underline" href={`/inbox/${lead.messageId}`}>Open</Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
