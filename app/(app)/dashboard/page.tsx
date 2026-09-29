import type { Metadata } from "next";
import { Suspense } from "react";
import DashboardView from "@/components/dashboard/DashboardView";
import PageLoading from "@/components/ui/PageLoading";

// Static page: loads instantly from Vercel's network; the data comes from /api/dashboard (saved in the browser).
export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <Suspense fallback={<PageLoading title="Dashboard" messages={["Checking today's leads…", "Counting credit applications…", "Looking for today's appointments…", "Almost there…"]} />}><DashboardView /></Suspense>;
}
