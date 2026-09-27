import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Inbox" messages={["Opening the inbox…", "Sorting the newest email to the top…", "Almost there…"]} />;
}
