import type { Metadata } from "next";
import Link from "next/link";
import PurchaseFollowupSettings from "@/components/ai/PurchaseFollowupSettings";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getAutoText, getPurchaseFollowup, listPurchases } from "@/lib/sms";
import { twilioConfigured } from "@/lib/sms/twilio";

export const metadata: Metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const LABEL: Record<string, string> = {
  scheduled: "Scheduled", due: "Due now", sent: "Text written", off: "Off for this customer", no_phone: "Needs a phone number", too_late: "Skipped (too long ago)", not_purchased: "",
};

export default async function AutomationsPage() {
  const staff = await requirePageStaff();
  const header = <PageHeader title="Automations" description="Things the AI does on its own." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Automations" /></>;
  const settings = await fresh("Automations", () => getPurchaseFollowup());
  const [purchases, autoText] = await Promise.all([listPurchases(settings.days), getAutoText()]);

  return (
    <div className="max-w-4xl">
      {header}
      <section aria-labelledby="pf" className="panel p-5">
        <h2 id="pf" className="text-lg font-semibold">Follow up after a purchase</h2>
        <p className="mt-1 text-sm text-muted">
          When you mark a customer <b>Purchased</b> (or add them with &ldquo;They already bought a car&rdquo;), the AI texts them a few days later to ask how the car is doing. Each customer gets one text.
          {" "}{autoText ? "Automatic texting is on, so it sends by itself Mon to Sat, 9 AM to 7 PM." : "Automatic texting is off, so the AI writes it as a draft and someone clicks Send on the customer's page."}
          {!twilioConfigured() && " Nothing is sent until Twilio is connected; purchases made before then are texted once it is (if they're still within a few weeks)."}
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <PurchaseFollowupSettings initialOn={settings.on} initialDays={settings.days} canChange={can.editAiSettings(staff.role)} />
        </div>
      </section>

      <section aria-labelledby="recent" className="mt-8">
        <h2 id="recent" className="mb-3 text-lg font-semibold">Recent purchases</h2>
        {purchases.length === 0 ? <p className="panel p-5 text-muted">No purchases yet. Mark a customer Purchased, or use Add customer on the Customers page.</p> : (
          <ul className="panel divide-y divide-line">
            {purchases.map((p) => (
              <li key={p.key}>
                <Link href={`/customers/${encodeURIComponent(p.key)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper/60">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{p.name || p.phone || "Customer"}</span>
                    <span className="text-muted">{p.vehicle ? ` · ${p.vehicle}` : ""} · bought {day(p.purchasedAt)}</span>
                  </span>
                  <span className="text-sm text-muted">{LABEL[p.state]}{p.state === "scheduled" && p.dueOn ? ` for ${day(p.dueOn)}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
