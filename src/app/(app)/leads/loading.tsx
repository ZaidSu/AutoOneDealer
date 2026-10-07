import PageLoading from "@/components/ui/PageLoading";

export default function Loading() {
  return <PageLoading title="Leads" messages={["Pulling in the latest leads…", "Reading Cars.com, CarsForSale and Edmunds emails…", "Matching up phone numbers and cars…", "Almost there…"]} />;
}
