import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Credit Applications" messages={["Finding credit applications…", "Reading loan amounts and down payments…", "Almost there…"]} />;
}
