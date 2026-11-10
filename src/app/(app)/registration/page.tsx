import type { Metadata } from "next";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import RegistrationBoard from "@/components/registration/RegistrationBoard";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getRegSettings, listRegistrations, registrationCounts, syncPurchases } from "@/lib/registration/store";

export const metadata: Metadata = { title: "Registration" };
export const dynamic = "force-dynamic";

export default async function RegistrationPage() {
  await requirePageStaff();
  const header = <PageHeader title="Registration" description="Registration stickers: what needs to be picked up, what needs a copy, and who has a deferred payment." action={<a href="/registration/sales#log-sale" className="btn btn-red">+ Log a sale</a>} />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Registration" /></>;
  const [rows, counts, settings] = await fresh("Registration", async () => {
    await syncPurchases().catch(() => 0); // every car sold to a customer gets an entry
    return Promise.all([listRegistrations(), registrationCounts(), getRegSettings()]);
  });
  return <div className="max-w-6xl">{header}<RegistrationBoard rows={rows} counts={counts} settings={settings} /></div>;
}
