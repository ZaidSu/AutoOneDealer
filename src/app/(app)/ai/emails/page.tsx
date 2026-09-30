import type { Metadata } from "next";
import NotSetUp from "@/components/ai/NotSetUp";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "AI email replies" };

export default async function AiEmailsPage() {
  await requirePageStaff();
  return (
    <>
      <PageHeader title="Email replies" description="Every email the AI sends a customer: what they wrote, and exactly what the AI said back." />
      <NotSetUp icon="mail" title="AI email replies aren't turned on yet"
        body="Once they are, each reply shows up here with the customer's message next to it, so you can check every word. Start by teaching the AI about the dealership."
        next={{ href: "/ai/train", label: "Train your AI" }} />
    </>
  );
}
