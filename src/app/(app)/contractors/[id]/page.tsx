import type { Metadata } from "next";
import ServeView from "@/components/views/ServeView";

export const metadata: Metadata = { title: "Contractor" };
export const maxDuration = 45;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  return <ServeView view="contractor" contractorId={id} searchParams={await searchParams} />;
}
