import type { Metadata } from "next";
import TrainingForm from "@/components/ai/TrainingForm";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { getAiTraining } from "@/lib/ai/settings";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "Train your AI" };
export const dynamic = "force-dynamic";

export default async function TrainAiPage() {
  const staff = await requirePageStaff();
  const state = await dbState();
  const header = <PageHeader title="Train your AI" description="Teach the AI how the dealership talks to customers. It follows this, plus the dealership info, whenever it replies." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="AI training" /></>;
  const training = await fresh("AI training", () => getAiTraining());
  return <div className="max-w-3xl">{header}<TrainingForm initial={training} canEdit={can.editAiSettings(staff.role)} /></div>;
}
