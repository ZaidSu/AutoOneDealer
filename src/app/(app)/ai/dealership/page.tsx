import type { Metadata } from "next";
import DealershipInfoForm from "@/components/ai/DealershipInfoForm";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { getDealershipInfo } from "@/lib/ai/settings";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "Dealership info" };
export const dynamic = "force-dynamic";

export default async function DealershipInfoPage() {
  const staff = await requirePageStaff();
  const state = await dbState();
  const header = <PageHeader title="Dealership info" description="Your address, hours and links. The AI uses these to answer customers correctly." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Dealership info" /></>;
  const info = await fresh("Dealership info", () => getDealershipInfo());
  return <div className="max-w-3xl">{header}<DealershipInfoForm initial={info} canEdit={can.manageIntegrations(staff.role)} /></div>;
}
