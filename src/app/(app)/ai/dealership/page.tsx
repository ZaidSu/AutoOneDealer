import type { Metadata } from "next";
import DealershipInfoForm from "@/components/ai/DealershipInfoForm";
import RepAlertLog from "@/components/ai/RepAlertLog";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { getRepAlerts } from "@/lib/ai/rep-alerts";
import { getDealershipInfo } from "@/lib/ai/settings";
import { fetchSmsStatus } from "@/lib/sms/twilio";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "Dealership info" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DealershipInfoPage() {
  const staff = await requirePageStaff();
  const state = await dbState();
  const header = <PageHeader title="Dealership info" description="Your address, hours and links. The AI uses these to answer customers correctly." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Dealership info" /></>;
  const info = await fresh("Dealership info", () => getDealershipInfo());
  const alerts = await getRepAlerts();
  // Ask Twilio where the most recent ones are now (delivered or not).
  const live: Record<string, string> = {};
  await Promise.all(alerts.slice(0, 8).filter((a) => a.sid).map(async (a) => { const r = await fetchSmsStatus(a.sid!); if (r) live[a.sid!] = r.status; }));
  return <div className="max-w-3xl">{header}<DealershipInfoForm initial={info} canEdit={can.editAiSettings(staff.role)} /><div className="mt-6"><RepAlertLog alerts={alerts} live={live} canScan={can.editAiSettings(staff.role)} /></div></div>;
}
