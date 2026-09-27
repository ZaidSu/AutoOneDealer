import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Customers" messages={["Gathering your customers…", "Matching repeat customers by phone number…", "Checking who came from where…", "Lining everyone up, newest first…", "Almost there…"]} />;
}
