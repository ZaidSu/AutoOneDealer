// Server side of every signed-in page: checks the sign-in, loads the data, and shows the view.
// In preview mode (nothing connected yet) it hands off to the browser version instead.
import { notFound } from "next/navigation";
import * as serverActions from "@/app/actions";
import PreviewPage from "@/components/preview/PreviewPage";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { todayCentral } from "@/lib/calc";
import { getData } from "@/lib/db/data";
import { previewMode } from "@/lib/mode";
import QuarterBanner from "@/components/ui/QuarterBanner";
import { BANNER_VIEWS, VIEWS, type ViewName } from "./registry";

export default async function ServeView({ view, searchParams, contractorId, invoiceId }: {
  view: ViewName; searchParams?: Record<string, string | undefined>; contractorId?: string; invoiceId?: string;
}) {
  if (previewMode()) return <PreviewPage view={view} contractorId={contractorId} invoiceId={invoiceId} />;
  const staff = await requirePageStaff();
  const { title, Component } = VIEWS[view];
  const loaded = await getData();
  if (loaded.state !== "ready") return <><PageHeader title={title} /><DbNotice state={loaded.state} /></>;
  if (view === "contractor" && !loaded.data.contractors.some((c) => c.id === contractorId)) notFound();
  if (view === "invoice" && !loaded.data.invoices.some((i) => i.id === invoiceId)) notFound();
  const today = todayCentral();
  return (
    <>
      {BANNER_VIEWS.has(view) && <QuarterBanner data={loaded.data} today={today} />}
      <Component data={loaded.data} params={searchParams ?? {}} editable={can.edit(staff.role)} act={serverActions} today={today} contractorId={contractorId} invoiceId={invoiceId} />
    </>
  );
}
