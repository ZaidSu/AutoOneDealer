import ActionForm from "@/components/ui/ActionForm";
import Badge from "@/components/ui/Badge";
import DeleteButton from "@/components/ui/DeleteButton";
import Empty from "@/components/ui/Empty";
import PageHeader from "@/components/ui/PageHeader";
import { money, round2 } from "@/lib/calc";
import type { Project } from "@/lib/types";
import type { ViewProps } from "./types";

const STATUS: Record<Project["status"], string> = { active: "Active", paused: "Paused", done: "Done" };

function Fields({ p }: { p?: Project }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {p && <input type="hidden" name="project_id" value={p.id} />}
      <label className="field">Project name<input name="name" required className="input" defaultValue={p?.name ?? ""} placeholder="Website for ..." /></label>
      <label className="field">Client<input name="client" className="input" defaultValue={p?.client ?? ""} placeholder="Who it's for" /></label>
      <label className="field">Status
        <select name="status" className="input" defaultValue={p?.status ?? "active"}><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option></select>
      </label>
      <label className="field">Notes<input name="notes" className="input" defaultValue={p?.notes ?? ""} /></label>
    </div>
  );
}

export default function ProjectsView({ data, editable, act }: ViewProps) {
  const { projects, income } = data;
  const rows = projects.map((p) => {
    const mine = income.filter((r) => r.project_id === p.id);
    return { p, mine, total: round2(mine.reduce((a, r) => a + r.amount, 0)) };
  }).sort((a, b) => (a.p.status === "done" ? 1 : 0) - (b.p.status === "done" ? 1 : 0));
  const loose = income.filter((r) => !r.project_id);
  const looseTotal = round2(loose.reduce((a, r) => a + r.amount, 0));

  return (
    <>
      <PageHeader title="Software projects" description="The jobs you&rsquo;re building. Click an arrow to see what each one has paid you." />

      {editable && (
        <section className="card">
          <h2 className="mb-3">Add a project</h2>
          <ActionForm action={act.saveProjectAction} submitLabel="Add project"><Fields /></ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2">{projects.length} {projects.length === 1 ? "project" : "projects"}</h2>
        {projects.length === 0 ? <Empty title="No projects yet">{editable ? "Add your first one above." : "Nothing has been added yet."}</Empty> : (
          <div className="divide-y divide-line">
            {rows.map(({ p, mine, total }) => (
              <details key={p.id} className="group py-1">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-1 py-3 hover:bg-bg [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-90">▶</span>
                  <span className="min-w-[8rem] flex-1 font-extrabold">{p.name}{p.client ? <span className="ml-2 text-sm font-normal text-muted">{p.client}</span> : null}</span>
                  <span className="text-right"><span className="block text-xs text-muted">Paid so far</span><span className="font-bold">{money(total)}</span></span>
                  <Badge tone={p.status === "active" ? "green" : p.status === "paused" ? "amber" : "plain"}>{STATUS[p.status]}</Badge>
                </summary>
                <div className="mb-3 ml-6 mt-1 space-y-3 rounded-xl bg-bg p-4">
                  {mine.length === 0 ? <p className="text-sm text-muted">No income recorded for this project yet.</p> : (
                    <table className="data-table compact">
                      <thead><tr><th>Date</th><th>From</th><th className="r">Amount</th></tr></thead>
                      <tbody>{mine.map((r) => <tr key={r.id}><td>{r.received_on}</td><td className="wrap">{r.source}{r.notes ? <div className="text-xs text-muted">{r.notes}</div> : null}</td><td className="r font-bold">{money(r.amount)}</td></tr>)}</tbody>
                    </table>
                  )}
                  {p.notes && <p className="text-sm"><span className="text-muted">Notes: </span>{p.notes}</p>}
                  {editable && (
                    <div className="border-t border-line pt-3">
                      <ActionForm action={act.saveProjectAction} submitLabel="Save changes" reset={false}><Fields p={p} /></ActionForm>
                      <div className="mt-3"><DeleteButton action={act.deleteProjectAction} id={p.id} confirmText={`Delete the project “${p.name}”? Its income stays, just without a project.`} /></div>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
        {loose.length > 0 && <p className="mt-3 text-sm text-muted">{money(looseTotal)} of income isn&rsquo;t on any project.</p>}
      </section>
    </>
  );
}
