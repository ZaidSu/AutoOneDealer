import type { Metadata } from "next";
import { Suspense } from "react";
import CustomersView from "@/components/customers/CustomersView";
import PageLoading from "@/components/ui/PageLoading";

// Static page: loads instantly from Vercel's network; the data comes from /api/customers (saved in the browser).
export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <Suspense fallback={<PageLoading title="Customers" messages={["Gathering your customers…", "Matching repeat customers by phone number…", "Checking who came from where…", "Lining everyone up, newest first…", "Almost there…"]} />}><CustomersView /></Suspense>;
}
