import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Analytics" messages={["Crunching the numbers…", "Counting leads by source…", "Sorting in state from out of state…", "Drawing the charts…", "Almost there…"]} />;
}
