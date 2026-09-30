import type { Metadata } from "next";
import NotSetUp from "@/components/ai/NotSetUp";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Phone numbers" };

export default async function PhoneNumbersPage() {
  await requirePageStaff();
  return (
    <>
      <PageHeader title="Phone numbers" description="The numbers the AI texts customers from." />
      <NotSetUp icon="phone" title="No texting number connected"
        body="A texting number will be added here when AI texting is set up. Customers will see texts coming from it, and their replies land in Text messages." />
    </>
  );
}
