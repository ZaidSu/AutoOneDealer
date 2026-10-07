"use client";
import { addRepAction, addSourceAction, removeRepAction, removeSourceAction } from "@/app/actions";
import ListEditor from "./ListEditor";

type Item = { id: number; name: string };

export default function TeamAndSources({ reps, sources, canEdit }: { reps: Item[]; sources: Item[]; canEdit: boolean }) {
  return (
    <>
      <ListEditor
        title="Sales team"
        description="Salespeople you can assign customers and appointments to. Removing someone keeps their past appointments; their current customers become unassigned."
        items={reps}
        addLabel="Add"
        placeholder="Salesperson's name"
        canEdit={canEdit}
        confirmRemove={(n) => `Remove ${n} from the sales team? Their current customers will become unassigned.`}
        onAdd={addRepAction}
        onRemove={removeRepAction}
      />
      <ListEditor
        title="Where customers heard about us"
        description="Choices for the “Heard about us” label. Leads from sites like Cars.com or Edmunds fill this in automatically."
        items={sources}
        addLabel="Add"
        placeholder="Radio ad, TikTok, billboard…"
        canEdit={canEdit}
        confirmRemove={(n) => `Remove “${n}” from the list? Customers already labeled with it keep the label.`}
        onAdd={addSourceAction}
        onRemove={removeSourceAction}
      />
    </>
  );
}
