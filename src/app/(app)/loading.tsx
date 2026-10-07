import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Loading" messages={["Getting things ready…", "Almost there…"]} />;
}
