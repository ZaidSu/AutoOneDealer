import type { Metadata } from "next";
import Link from "next/link";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh, readyDb } from "@/lib/db";
import { getPurchaseFollowup, listPurchases } from "@/lib/sms";
import { registrationFollowups } from "@/lib/registration/store";
import { dealership } from "@/lib/dealership";
import { addDays, dayKey } from "@/lib/utils/time";

export const metadata: Metadata = { title: "Follow-ups" };
export const dynamic = "force-dynamic";

type Item = { kind: "checkin" | "staff" | "registration"; who: string; detail: string; at: number; state: "scheduled" | "due" | "overdue" | "sent"; href: string };
const KIND = {
  checkin: { label: "Check-in text", chip: "bg-grape-soft text-[#4d2bb3]", bar: "#7048e8" },
  staff: { label: "Follow-up", chip: "bg-azure-soft text-[#1f4fb8]", bar: "#2f6fed" },
  registration: { label: "Registration reminder", chip: "bg-lagoon-soft text-[#07706b]", bar: "#0ca7a0" },
} as const;
const STATE = {
  scheduled: ["Scheduled", "bg-paper text-muted ring-1 ring-line"], due: ["Due now", "bg-sun-soft text-[#8a5300]"],
  overdue: ["Overdue", "bg-signal text-white"], sent: ["Happened", "bg-go-soft text-go"],
} as const;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: dealership.timeZone });

async function load(): Promise<{ upcoming: Item[]; happened: Item[] }> {
  const sql = await readyDb();
  const items: Item[] = [];
  const today = dayKey(Date.now(), dealership.timeZone);
  if (sql) {
    const staff = await sql`select key, name, phone, last_vehicle, follow_up_at from customers where follow_up_at is not null and status not in ('purchased', 'lost') order by follow_up_at limit 100`;
    for (const r of staff) {
      const d = String(r.follow_up_at instanceof Date ? r.follow_up_at.toISOString().slice(0, 10) : r.follow_up_at).slice(0, 10);
      items.push({ kind: "staff", who: r.name || r.phone || "Customer", detail: r.last_vehicle ?? "", at: new Date(`${d}T12:00:00-05:00`).getTime(), state: d < today ? "overdue" : d === today ? "due" : "scheduled", href: `/customers/${encodeURIComponent(r.key)}` });
    }
  }
  const settings = await getPurchaseFollowup().catch(() => null);
  if (settings) {
    for (const p of await listPurchases(settings.days, 80).catch(() => [])) {
      const href = `/customers/${encodeURIComponent(p.key)}`;
      if (p.state === "sent" && p.sentAt) items.push({ kind: "checkin", who: p.name || p.phone || "Customer", detail: p.vehicle ?? "", at: p.sentAt, state: "sent", href });
      else if ((p.state === "scheduled" || p.state === "due") && p.dueOn) items.push({ kind: "checkin", who: p.name || p.phone || "Customer", detail: p.vehicle ?? "", at: p.dueOn, state: p.state === "due" ? "due" : "scheduled", href });
    }
  }
  for (const r of await registrationFollowups().catch(() => [])) {
    items.push({ kind: "registration", who: r.name || "Customer", detail: r.vehicle ?? "", at: r.at, state: r.state === "sent" ? "sent" : r.at < Date.now() ? "due" : "scheduled", href: "/registration" });
  }
  const horizon = new Date(`${addDays(today, 60)}T12:00:00-05:00`).getTime();
  return {
    upcoming: items.filter((i) => i.state !== "sent" && i.at <= horizon).sort((a, b) => a.at - b.at),
    happened: items.filter((i) => i.state === "sent" && Date.now() - i.at < 45 * 86_400_000).sort((a, b) => b.at - a.at),
  };
}

function Row({ i }: { i: Item }) {
  const k = KIND[i.kind]; const [label, cls] = STATE[i.state];
  return (
    <li>
      <Link href={i.href} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper/60">
        <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: k.bar }} />
        <span className="w-[108px] shrink-0 text-sm font-semibold text-muted">{dayLabel(i.at)}</span>
        <span className="min-w-[160px] flex-1"><span className="font-bold">{i.who}</span>{i.detail && <span className="text-muted"> · {i.detail}</span>}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${k.chip}`}>{k.label}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
      </Link>
    </li>
  );
}

export default async function FollowUpsPage() {
  await requirePageStaff();
  const header = <PageHeader title="Follow-ups" description="What is scheduled and what already happened: check-in texts after a sale, registration reminders, and follow-ups your team set." />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Follow-ups" /></>;
  const { upcoming, happened } = await fresh("Follow-ups", load);
  const weekEnd = new Date(`${addDays(dayKey(Date.now(), dealership.timeZone), 7)}T23:59:00-05:00`).getTime();
  const thisWeek = upcoming.filter((i) => i.at <= weekEnd);
  const later = upcoming.filter((i) => i.at > weekEnd);
  return (
    <div className="max-w-5xl">
      {header}
      <section aria-labelledby="week" className="mb-8">
        <h2 id="week" className="mb-3 text-lg font-bold">This week <span className="ml-1 rounded-full bg-azure-soft px-2 py-0.5 align-middle text-xs font-bold text-[#1f4fb8]">{thisWeek.length}</span></h2>
        {thisWeek.length === 0 ? <p className="panel p-5 text-muted">Nothing scheduled this week.</p> : <ul className="panel divide-y divide-line overflow-hidden">{thisWeek.map((i, n) => <Row key={`w${n}`} i={i} />)}</ul>}
      </section>
      {later.length > 0 && (
        <section aria-labelledby="later" className="mb-8">
          <h2 id="later" className="mb-3 text-lg font-bold">Coming up later <span className="ml-1 text-sm font-semibold text-muted">{later.length}</span></h2>
          <ul className="panel divide-y divide-line overflow-hidden">{later.slice(0, 40).map((i, n) => <Row key={`l${n}`} i={i} />)}</ul>
        </section>
      )}
      <section aria-labelledby="done">
        <h2 id="done" className="mb-3 text-lg font-bold">Happened <span className="ml-1 text-sm font-semibold text-muted">last 45 days</span></h2>
        {happened.length === 0 ? <p className="panel p-5 text-muted">No follow-ups have gone out yet.</p> : <ul className="panel divide-y divide-line overflow-hidden">{happened.slice(0, 60).map((i, n) => <Row key={`h${n}`} i={i} />)}</ul>}
      </section>
    </div>
  );
}
