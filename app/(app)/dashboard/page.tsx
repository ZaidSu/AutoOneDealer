import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { getGmailConnection, getStaffSession } from "@/lib/auth/session";
import { greeting } from "@/lib/dealership";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const staff = (await getStaffSession())!;
  const gmail = await getGmailConnection();
  const firstName = staff.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description="Here's what needs attention at the dealership." />

      <section aria-labelledby="inbox-status" className="max-w-3xl rounded-lg border border-line bg-white p-6">
        <h2 id="inbox-status" className="text-lg font-semibold">Dealership inbox</h2>
        {gmail ? (
          <p className="mt-1 text-muted">
            Connected to <span className="font-medium text-ink">{gmail.mailbox}</span>. Automatic lead detection from
            CarsForSale emails is the next part being built.
          </p>
        ) : (
          <>
            <p className="mt-1 text-muted">
              Connect your inbox in Settings so new finance applications and customer emails show up here.
            </p>
            {can.manageIntegrations(staff.role) ? (
              <Link
                href="/settings"
                className="mt-4 inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark"
              >
                Go to Settings
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted">Ask an owner or manager to connect it.</p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="today" className="mt-6 max-w-3xl rounded-lg border border-dashed border-line p-6">
        <h2 id="today" className="text-lg font-semibold">Today</h2>
        <p className="mt-1 text-muted">
          No leads, messages or appointments yet. They'll appear here once lead detection and appointments are switched
          on. Nothing on this page is sample data.
        </p>
      </section>
    </>
  );
}
