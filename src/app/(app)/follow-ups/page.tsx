import type { Metadata } from "next";
import FollowUpsBoard, { type FollowItem } from "@/components/ai/FollowUpsBoard";
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

type Item = { kind: "checkin" | "staff" | "registration"; who: string; detail: string; at: number; state: "scheduled" | "due" | "overdue" | "sent"; href: string; customerKey: string | null };
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: dealership.timeZone });

async function load(): Promise<{ upcoming: Item[]; happened: Item[] }> {
  const sql = await readyDb();
  const items: Item[] = [];
  const today = dayKey(Date.now(), dealership.timeZone);
  if (sql) {
    const staff = await sql`select key, name, phone, last_vehicle, follow_up_at from customers where follow_up_at is not null and status not in ('purchased', 'lost') order by follow_up_at limit 100`;
    for (const r of staff) {
      const d = String(r.follow_up_at instanceof Date ? r.follow_up_at.toISOString().slice(0, 10) : r.follow_up_at).slice(0, 10);
      items.push({ kind: "staff", who: r.name || r.phone || "Customer", detail: r.last_vehicle ?? "", at: new Date(`${d}T12:00:00-05:00`).getTime(), state: d < today ? "overdue" : d === today ? "due" : "scheduled", href: `/customers/${encodeURIComponent(r.key)}`, customerKey: r.key as string });
    }
  }
  const settings = await getPurchaseFollowup().catch(() => null);
  if (settings) {
    for (const p of await listPurchases(settings.days, 80).catch(() => [])) {
      const href = `/customers/${encodeURIComponent(p.key)}`; const customerKey = p.key;
      if (p.state === "sent" && p.sentAt) items.push({ kind: "checkin", who: p.name || p.phone || "Customer", detail: p.vehicle ?? "", at: p.sentAt, state: "sent", href, customerKey });
      else if ((p.state === "scheduled" || p.state === "due") && p.dueOn) items.push({ kind: "checkin", who: p.name || p.phone || "Customer", detail: p.vehicle ?? "", at: p.dueOn, state: p.state === "due" ? "due" : "scheduled", href, customerKey });
    }
  }
  for (const r of await registrationFollowups().catch(() => [])) {
    items.push({ kind: "registration", who: r.name || "Customer", detail: r.vehicle ?? "", at: r.at, state: r.state === "sent" ? "sent" : r.at < Date.now() ? "due" : "scheduled", href: "/registration", customerKey: null });
  }
  const horizon = new Date(`${addDays(today, 60)}T12:00:00-05:00`).getTime();
  return {
    upcoming: items.filter((i) => i.state !== "sent" && i.at <= horizon).sort((a, b) => a.at - b.at),
    happened: items.filter((i) => i.state === "sent" && Date.now() - i.at < 45 * 86_400_000).sort((a, b) => b.at - a.at),
  };
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
  const toRow = (i: Item, n: number): FollowItem => ({ id: `${i.kind}-${i.customerKey ?? "x"}-${n}`, kind: i.kind, who: i.who, detail: i.detail, dayLabel: dayLabel(i.at), state: i.state, customerKey: i.customerKey, href: i.href });
  return (
    <div className="max-w-6xl">
      {header}
      <FollowUpsBoard thisWeek={thisWeek.map(toRow)} later={later.slice(0, 40).map((i, n) => toRow(i, 1000 + n))} happened={happened.slice(0, 60).map((i, n) => toRow(i, 2000 + n))} />
    </div>
  );
}
