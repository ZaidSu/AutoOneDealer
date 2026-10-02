import type { Metadata } from "next";
import TodoList from "@/components/todo/TodoList";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";
import { getTodos } from "@/lib/crm/todos";
import { dbState, fresh } from "@/lib/db";

export const metadata: Metadata = { title: "To do" };
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export default async function TodoPage() {
  await requirePageStaff();
  const header = <PageHeader title="To do" description="Customers who need a person right now: who to call, who wrote back, and what's coming up. Done or Snooze hides an item. It comes back if the customer does something new." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="The To do list" /></>;
  const { rows, problems } = await fresh("To do", () => getTodos());
  return (
    <div className="max-w-5xl">
      {header}
      {problems.length > 0 && (
        <p role="alert" className="mb-5 rounded-xl border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-sm">Part of this list couldn&apos;t load ({problems.join(", ")}). Refresh to try again.</p>
      )}
      <TodoList rows={rows} />
    </div>
  );
}
