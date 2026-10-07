import type { Metadata } from "next";
import ServeView from "@/components/views/ServeView";

export const metadata: Metadata = { title: "Dashboard" };
export const maxDuration = 45;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ServeView view="dashboard" searchParams={await searchParams} />;
}
