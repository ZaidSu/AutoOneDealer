import type { Metadata } from "next";
import ServeView from "@/components/views/ServeView";

export const metadata: Metadata = { title: "Invoice" };
export const maxDuration = 45;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  return <ServeView view="invoice" invoiceId={id} searchParams={await searchParams} />;
}
