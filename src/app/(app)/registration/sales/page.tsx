import type { Metadata } from "next";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import SalesBoard from "@/components/registration/SalesBoard";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { lotCars, recentSales } from "@/lib/registration/sales";

export const metadata: Metadata = { title: "Recent sales" };
export const dynamic = "force-dynamic";

export default async function RegistrationSalesPage() {
  await requirePageStaff();
  const header = <PageHeader title="Recent sales" description="Customers who bought a car lately. Sales are added by hand here, like in DeskManager." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Recent sales" /></>;
  const [sales, lot] = await fresh("Recent sales", () => Promise.all([recentSales(), lotCars()]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  return <div className="max-w-6xl">{header}<SalesBoard sales={sales} lot={lot} today={today} /></div>;
}
