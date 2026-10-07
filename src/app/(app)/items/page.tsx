import type { Metadata } from "next";
import ServeView from "@/components/views/ServeView";

export const metadata: Metadata = { title: "Items" };
export const maxDuration = 45;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ServeView view="items" searchParams={await searchParams} />;
}
