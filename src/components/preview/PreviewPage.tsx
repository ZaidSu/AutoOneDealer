"use client";
// Renders a page in preview mode: the same view the live site uses, fed from data saved in this browser.
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import QuarterBanner from "@/components/ui/QuarterBanner";
import { BANNER_VIEWS, VIEWS, type ViewName } from "@/components/views/registry";
import PageHeader from "@/components/ui/PageHeader";
import { todayCentral } from "@/lib/calc";
import { previewActions } from "@/lib/preview/actions";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/preview/store";
import { PreviewContext } from "./PreviewContext";

export default function PreviewPage({ view, contractorId, invoiceId }: { view: ViewName; contractorId?: string; invoiceId?: string }) {
  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const search = useSearchParams();
  const { title, Component } = VIEWS[view];

  if (!data) return <div aria-busy="true" role="status" className="h-72 animate-pulse rounded-2xl bg-line/70"><span className="sr-only">Loading</span></div>;
  if (view === "contractor" && !data.contractors.some((c) => c.id === contractorId)) {
    return <><PageHeader title="Contractor not found" /><a className="link-btn" href="/contractors">Back to contractors</a></>;
  }
  if (view === "invoice" && !data.invoices.some((i) => i.id === invoiceId)) {
    return <><PageHeader title="Invoice not found" /><a className="link-btn" href="/invoices">Back to invoices</a></>;
  }
  return (
    <PreviewContext.Provider value={{ enabled: true, data }}>
      {BANNER_VIEWS.has(view) && <QuarterBanner data={data} today={todayCentral()} />}
      <Component key={title} data={data} params={Object.fromEntries(search.entries())} editable act={previewActions} today={todayCentral()} contractorId={contractorId} invoiceId={invoiceId} />
    </PreviewContext.Provider>
  );
}
