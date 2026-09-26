import type { Metadata } from "next";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { displayName, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { creditApplications, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Credit Applications" };
export const dynamic = "force-dynamic";

export default async function CreditApplicationsPage() {
  const result = await withGmail((gmail) => creditApplications(gmail));

  return (
    <>
      <PageHeader
        title="Credit Applications"
        description="Finance applications submitted through CarsForSale, read from the dealership inbox. A received application isn't an approval."
      />
      {result.status !== "ok" ? (
        <GmailState status={result.status} />
      ) : result.data.length === 0 ? (
        <p className="max-w-2xl rounded-lg border border-dashed border-line p-6 text-muted">
          No CarsForSale finance applications in the last 6 months. New ones will show up here as soon as they reach the inbox.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {result.data.length} application{result.data.length === 1 ? "" : "s"} in the last 6 months, newest first.
          </p>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Applicant</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Loan amount</th>
                  <th className="px-4 py-3 font-medium">Down payment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"><span className="sr-only">Links</span></th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((app) => (
                  <tr key={app.messageId} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(app.receivedAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{displayName(app.name)}</p>
                      <p className="text-sm text-muted">
                        {app.location ?? "Location not provided"}
                        {app.applicationId && ` · App #${app.applicationId}`}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {app.phone ? <a className="hover:text-signal hover:underline" href={`tel:${app.phone}`}>{formatPhone(app.phone)}</a> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">{formatMoney(app.loanAmount)}</td>
                    <td className="px-4 py-3">{formatMoney(app.downPayment)}</td>
                    <td className="px-4 py-3"><Badge tone="application">Received</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {app.viewUrl && (
                        <a className="font-semibold text-signal hover:underline" href={app.viewUrl} target="_blank" rel="noopener noreferrer">
                          Open in CarsForSale
                        </a>
                      )}
                      <a className="ml-4 text-muted hover:text-ink hover:underline" href={app.gmailUrl} target="_blank" rel="noopener noreferrer">
                        Email
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">
            The full application, including anything sensitive, stays in CarsForSale. AutoDash only shows what the notification email contains.
          </p>
        </>
      )}
    </>
  );
}
