import type { Metadata } from "next";
import NotSetUp from "@/components/ai/NotSetUp";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "AI text messages" };

export default async function AiTextsPage() {
  await requirePageStaff();
  return (
    <>
      <PageHeader title="Text messages" description="Every text the AI sends or answers, as full conversations with each customer." />
      <NotSetUp icon="chat" title="AI texting isn't turned on yet"
        body="Texting needs a phone number for the AI to text from. Once one is connected, every conversation shows up here."
        next={{ href: "/ai/phone-numbers", label: "Phone numbers" }} />
    </>
  );
}
