import type { Metadata } from "next";
import NotSetUp from "@/components/ai/NotSetUp";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  await requirePageStaff();
  return (
    <>
      <PageHeader title="Automations" description="Things the AI does on its own, like answering a new lead within a minute when the store is closed." />
      <NotSetUp icon="automations" title="No automations yet"
        body="Automations will be simple rules: when something happens (a new lead, a missed appointment), the AI does something (replies, texts, reminds a salesperson). They'll be listed here, each with an on/off switch." />
    </>
  );
}
