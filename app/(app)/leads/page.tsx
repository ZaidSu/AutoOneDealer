import type { Metadata } from "next";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { displayName, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { creditApplications, websiteLeads, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kind: "application" | "inquiry";
  name: string | null;
  phone: string | null;
  email: string | null;
  detail: string;
  receivedAt: number;
  gmailUrl: string;
};

export default async function LeadsPage() {
  const result = await withGmail(async (gmail) => {
    const [apps, inquiries] = await Promise.all([creditApplications(gmail), websiteLeads(gmail)]);
    const rows: Row[] = [
      ...apps.map((a) => ({
        id: a.messageId,
        kind: "application" as const,
        name: a.name,
        phone: a.phone,
        email: a.email,
        detail: [a.loanAmount !== null && `Loan ${formatMoney(a.loanAmount)}`, a.location].filter(Boolean).join(" · "),
        receivedAt: a.receivedAt,
        gmailUrl: a.gmailUrl,
      })),
      ...inquiries.map((l) => ({
        id: l.messageId,
        kind: "inquiry" as const,
        name: l.name,
        phone: l.phone,
        email: l.email,
        detail: l.comments ? `“${l.comments.slice(0, 140)}${l.comments.length > 140 ? "…" : ""}”` : l.source ?? "",
        receivedAt: l.receivedAt,
        gmailUrl: l.gmailUrl,
      })),
    ];
    return rows.sort((a, b) => b.receivedAt - a.receivedAt);
  });

  return (
    <>
      <PageHeader title="Leads" description="Every CarsForSale credit application and website inquiry, newest first." />
      {result.status !== "ok" ? (
        <GmailState status={result.status} />
      ) : result.data.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          No leads in the last 6 months. New CarsForSale applications and inquiries will appear here automatically.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            {result.data.map((row) => (
              <li key={row.id} className="grid gap-x-6 gap-y-1 px-4 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{displayName(row.name)}</p>
                    <Badge tone={row.kind}>{row.kind === "application" ? "Credit application" : "Website inquiry"}</Badge>
                  </div>
                  {row.detail && <p className="mt-0.5 truncate text-sm text-muted">{row.detail}</p>}
                </div>
                <div className="text-[15px]">
                  {row.phone && <a className="block hover:text-signal hover:underline" href={`tel:${row.phone}`}>{formatPhone(row.phone)}</a>}
                  {row.email && <a className="block truncate text-sm text-muted hover:text-ink hover:underline" href={`mailto:${row.email}`}>{row.email}</a>}
                  {!row.phone && !row.email && <span className="text-sm text-muted">No contact details in the email</span>}
                </div>
                <div className="flex items-center gap-4 text-sm sm:justify-end">
                  <span className="whitespace-nowrap text-muted">{formatDateTime(row.receivedAt)}</span>
                  <a className="font-semibold text-signal hover:underline" href={`/inbox/${row.id}`}>Open</a>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Statuses, notes and assigning a salesperson need the shared customer database, which is the next step.
          </p>
        </>
      )}
    </>
  );
}
