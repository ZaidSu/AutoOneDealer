import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Dashboard" messages={["Checking today's leads…", "Counting credit applications…", "Looking for today's appointments…", "Almost there…"]} />;
}
