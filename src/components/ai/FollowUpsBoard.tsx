"use client";
// The Follow-ups page: the list on the left; click one and that customer's texts open on the right, on the same page
// (on a phone the list is replaced by the texts, with a Back button).
import Link from "next/link";
import { useState } from "react";
import TextThread from "@/components/customers/TextThread";

export type FollowItem = { id: string; kind: "checkin" | "staff" | "registration"; who: string; detail: string; dayLabel: string; state: "scheduled" | "due" | "overdue" | "sent"; customerKey: string | null; href: string };

const KIND = {
  checkin: { label: "Check-in text", chip: "bg-grape-soft text-[#4d2bb3]", bar: "#7048e8" },
  staff: { label: "Follow-up", chip: "bg-azure-soft text-[#1f4fb8]", bar: "#2f6fed" },
  registration: { label: "Registration reminder", chip: "bg-lagoon-soft text-[#07706b]", bar: "#0ca7a0" },
} as const;
const STATE = {
  scheduled: ["Scheduled", "bg-paper text-muted ring-1 ring-line"], due: ["Due now", "bg-sun-soft text-[#8a5300]"],
  overdue: ["Overdue", "bg-signal text-white"], sent: ["Happened", "bg-go-soft text-go"],
} as const;

export default function FollowUpsBoard({ thisWeek, later, happened }: { thisWeek: FollowItem[]; later: FollowItem[]; happened: FollowItem[] }) {
  const all = [...thisWeek, ...later, ...happened];
  const [picked, setPicked] = useState<string | null>(null);
  const current = all.find((i) => i.id === picked) ?? null;

  const Row = ({ i }: { i: FollowItem }) => {
    const k = KIND[i.kind]; const [label, cls] = STATE[i.state];
    const on = i.id === picked;
    const body = (
      <>
        <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: k.bar }} />
        <span className="w-[100px] shrink-0 text-sm font-semibold text-muted">{i.dayLabel}</span>
        <span className="min-w-[140px] flex-1"><span className="font-bold">{i.who}</span>{i.detail && <span className="text-muted"> · {i.detail}</span>}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${k.chip}`}>{k.label}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
      </>
    );
    const cn = `relative flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left transition-colors ${on ? "bg-[#eef3ff]" : "hover:bg-paper/60"}`;
    return <li>{i.customerKey ? <button type="button" aria-current={on ? "true" : undefined} onClick={() => setPicked(i.id)} className={cn}>{body}</button> : <Link href={i.href} className={cn}>{body}</Link>}</li>;
  };
  const Section = ({ id, title, note, items, empty, count }: { id: string; title: string; note?: string; items: FollowItem[]; empty: string; count?: boolean }) => (
    <section aria-labelledby={id} className="mb-7">
      <h2 id={id} className="mb-2.5 text-lg font-bold">{title} {count !== false && <span className="ml-1 rounded-full bg-azure-soft px-2 py-0.5 align-middle text-xs font-bold text-[#1f4fb8]">{items.length}</span>}{note && <span className="ml-1 text-sm font-semibold text-muted">{note}</span>}</h2>
      {items.length === 0 ? <p className="panel p-5 text-muted">{empty}</p> : <ul className="panel divide-y divide-line overflow-hidden">{items.map((i) => <Row key={i.id} i={i} />)}</ul>}
    </section>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(340px,460px)_minmax(0,1fr)]">
      <div className={current ? "hidden lg:block" : ""}>
        <p className="mb-4 text-[15px] text-muted">Click a person to read their texts here.</p>
        <Section id="week" title="This week" items={thisWeek} empty="Nothing scheduled this week." />
        {later.length > 0 && <Section id="later" title="Coming up later" items={later} empty="" count={false} />}
        <Section id="done" title="Happened" note="last 45 days" items={happened} empty="No follow-ups have gone out yet." count={false} />
      </div>
      <div className={current ? "" : "hidden lg:block"}>
        {!current?.customerKey ? (
          <div className="panel grid min-h-[320px] place-items-center p-8 text-center text-muted">Pick a follow-up on the left to see the texts with that customer.</div>
        ) : (
          <div className="lg:sticky lg:top-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button type="button" className="btn btn-sm lg:hidden" onClick={() => setPicked(null)}>← Back</button>
              <Link href={current.href} className="panel-link ml-auto">Open {current.who} →</Link>
            </div>
            <TextThread key={current.customerKey} customerKey={current.customerKey} firstName={current.who.trim().split(/\s+/)[0] || null} className="panel overflow-hidden" tall />
          </div>
        )}
      </div>
    </div>
  );
}
