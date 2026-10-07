import type { Metadata } from "next";
import ServeView from "@/components/views/ServeView";

export const metadata: Metadata = { title: "Taxes" };
export const maxDuration = 45;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ServeView view="taxes" searchParams={await searchParams} />;
}
