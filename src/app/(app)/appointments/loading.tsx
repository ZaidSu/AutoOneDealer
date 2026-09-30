import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Appointments" messages={["Opening the schedule…", "Checking who's booked with whom…", "Almost there…"]} />;
}
