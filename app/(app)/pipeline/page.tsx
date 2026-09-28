import type { Metadata } from "next";
import Link from "next/link";
import Board from "@/components/pipeline/Board";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { pipeline } from "@/lib/crm/queries";
import { dbState } from "@/lib/db";
import { listReps, STATUSES } from "@/lib/db/data";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const WINDOWS = { "30": "Last 30 days", "60": "Last 60 days", "90": "Last 90 days", "365": "Last 12 months" } as const;

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const days = params.days && params.days in WINDOWS ? params.days : "60";
  const repId = params.rep && /^\d+$/.test(params.rep) ? Number(params.rep) : null;
  const state = await dbState();
  const header = <PageHeader title="Pipeline" description="Every active customer by stage. Drag a card to move it, or open it for the full history." />;
  if (state !== "ready") return <>{header}<DbNotice state={state} what="The pipeline" /></>;
  const [columns, reps] = await Promise.all([pipeline({ repId, days: Number(days) }), listReps()]);
  const link = (extra: Record<string, string | undefined>) => ({ pathname: "/pipeline", query: Object.fromEntries(Object.entries({ days, rep: repId ? String(repId) : undefined, ...extra }).filter(([, v]) => v)) });

  return (
    <>
      {header}
      <div className="mb-5 flex flex-wrap gap-3">
        <nav aria-label="Salesperson" className="segmented">
          <Link href={link({ rep: undefined })} aria-current={!repId ? "page" : undefined}>Everyone</Link>
          {reps.map((r) => <Link key={r.id} href={link({ rep: String(r.id) })} aria-current={repId === r.id ? "page" : undefined}>{r.name}</Link>)}
        </nav>
        <nav aria-label="Time window" className="segmented">
          {Object.entries(WINDOWS).map(([d, label]) => <Link key={d} href={link({ days: d })} aria-current={days === d ? "page" : undefined}>{label}</Link>)}
        </nav>
      </div>
      <Board columns={columns} labels={Object.fromEntries(STATUSES.map((s) => [s.value, s.label]))} moreHref={(status) => `/customers?status=${status}${repId ? `&rep=${repId}` : ""}`} />
    </>
  );
}
