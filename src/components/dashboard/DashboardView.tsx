"use client";
// The Dashboard: today's date, today's appointments, and everything that came in since last night.
// Drawn from the browser's saved copy first, then refreshed quietly in the background.
import Link from "next/link";
import Badge from "@/components/leads/Badge";
import DbNotice from "@/components/ui/DbNotice";
import PageLoading from "@/components/ui/PageLoading";
import { useLive } from "@/lib/client/live";
import type { Lead } from "@/lib/gmail";
import { displayName, formatMoney, formatPhone } from "@/lib/utils/format";

type Appt = { id: number; customerName: string; vehicle: string | null; phone: string | null; repName: string | null; status: string; startsAt: number };
type Data = {
  state: "ready" | "unreachable" | "not_configured"; dbReady: boolean; tz: string; greeting: string; firstName: string;
  problems: string[]; since: number; counts: { leads: number; applications: number } | null; latest: Lead[];
  appointmentsToday: Appt[] | null; ai: { enabled: boolean; emails: number; texts: number };
};

const fmt = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o });

export default function DashboardView() {
  const { data, error } = useLive<Data>("/api/dashboard");
  if (!data) {
    return error
      ? <p role="alert" className="card max-w-2xl p-5 text-signal">Couldn&apos;t load the Dashboard: {error}. Check your connection and refresh.</p>
      : <PageLoading title="Dashboard" messages={["Checking what came in overnight…", "Counting credit applications…", "Looking up today's appointments…", "Almost there…"]} />;
  }
  if (!data.dbReady || !data.since) return <><DateHeader tz={data.tz} line="Here's what's happening at the dealership." /><DbNotice state={data.state} what="The Dashboard" /></>;

  const { tz, counts, latest, problems, ai } = data;
  const time = fmt(tz, { hour: "numeric", minute: "2-digit" });
  const appts = data.appointmentsToday ?? [];
  const upcoming = appts.filter((a) => a.status === "scheduled" && a.startsAt >= Date.now() - 30 * 60_000);
  const nextId = upcoming[0]?.id;

  return (
    <div className="max-w-6xl">
      <DateHeader tz={tz} line={`${data.greeting}, ${data.firstName}. Here's everything since ${time.format(data.since)} yesterday.`} />

      {problems.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-signal/25 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-semibold">Part of this page couldn&apos;t load. Refresh to try again.</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <section aria-label="Since last night" className="stat-strip mb-8 lg:grid-cols-4">
        <Stat href="/leads?show=inquiry" value={counts?.leads} label="New leads" hot />
        <Stat href="/credit-applications" value={counts?.applications} label="Credit applications" hot />
        <Stat href="/appointments" value={appts.length} label={upcoming.length && upcoming.length !== appts.length ? `Appointments today, ${upcoming.length} still to come` : "Appointments today"} />
        <Link href="/ai/emails" className="stat">
          {ai.enabled ? (
            <p className="stat-value">{ai.emails + ai.texts}</p>
          ) : (
            <p className="pt-1.5 font-condensed text-[1.6rem] font-semibold leading-tight text-faint">Not on yet</p>
          )}
          <p className="stat-label">{ai.enabled ? `AI replies: ${ai.emails} emails, ${ai.texts} texts` : "AI email and text replies"}</p>
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <section aria-labelledby="today-appts" className="panel">
          <div className="panel-head">
            <h2 id="today-appts">Today&apos;s appointments</h2>
            <Link href="/appointments" className="panel-link">Calendar</Link>
          </div>
          {appts.length === 0 ? (
            <p className="px-5 pt-1 pb-5 text-muted">Nothing booked for today. <Link href="/appointments" className="font-semibold text-ink underline">Book one</Link></p>
          ) : (
            <ul className="px-2 pb-2">
              {appts.map((a) => {
                const past = a.status !== "scheduled" || a.startsAt < Date.now() - 30 * 60_000;
                return (
                  <li key={a.id} className={`flex gap-4 rounded-lg px-3 py-3 ${a.id === nextId ? "bg-paper" : ""} ${past ? "opacity-55" : ""}`}>
                    <p className="w-[4.5rem] shrink-0 font-condensed text-xl font-semibold tabular-nums leading-6">{time.format(a.startsAt)}</p>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {a.customerName}
                        {a.id === nextId && <span className="ml-2 rounded-full bg-signal px-2 py-0.5 align-middle text-xs font-semibold text-white">Up next</span>}
                        {a.status === "showed" && <span className="ml-2 text-sm font-medium text-go">Showed up</span>}
                        {a.status === "no_show" && <span className="ml-2 text-sm font-medium text-signal">No-show</span>}
                      </p>
                      <p className="truncate text-sm text-muted">{a.vehicle ?? "Car not noted"}</p>
                      <p className="text-sm text-muted">
                        {a.phone && <a href={`tel:${a.phone}`} className="hover:text-ink hover:underline">{formatPhone(a.phone)}</a>}
                        {a.phone && a.repName && <span className="mx-1.5 text-faint">/</span>}
                        {a.repName && <span>with {a.repName}</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="overnight" className="panel">
          <div className="panel-head">
            <h2 id="overnight">Since last night</h2>
            <Link href="/leads" className="panel-link">All leads</Link>
          </div>
          {latest.length === 0 ? (
            <p className="px-5 pt-1 pb-5 text-muted">No new leads or applications since {time.format(data.since)} yesterday.</p>
          ) : (
            <ul className="divide-y divide-line px-5 pb-2">
              {latest.map((lead) => (
                <li key={lead.messageId} className="flex gap-4 py-3">
                  <p className="w-[4.5rem] shrink-0 pt-0.5 text-sm tabular-nums text-muted">{time.format(lead.receivedAt)}</p>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/inbox/${lead.messageId}`} className="font-semibold hover:text-signal hover:underline">{displayName(lead.name)}</Link>
                      <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application" : lead.type}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted">
                      {[lead.kind === "application" && lead.loanAmount !== null ? `Loan ${formatMoney(lead.loanAmount)}` : lead.vehicle, lead.provider].filter(Boolean).join(", ")}
                    </p>
                    {(lead.phone || lead.email) && (
                      <p className="truncate text-sm">
                        {lead.phone ? <a href={`tel:${lead.phone}`} className="hover:text-signal hover:underline">{formatPhone(lead.phone)}</a>
                          : <a href={`mailto:${lead.email}`} className="text-muted hover:text-ink hover:underline">{lead.email}</a>}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** The day's date as the page headline, with a line under it. */
function DateHeader({ tz, line }: { tz: string; line: string }) {
  const now = Date.now();
  return (
    <header className="mb-7">
      <p className="text-[15px] font-semibold text-signal">{fmt(tz, { weekday: "long" }).format(now)}</p>
      <h1 className="font-condensed text-[2.75rem] font-semibold leading-none tracking-[0.01em] sm:text-5xl">{fmt(tz, { month: "long", day: "numeric", year: "numeric" }).format(now)}</h1>
      <div aria-hidden className="lane mt-4 w-[152px] rounded-full" />
      <p className="mt-4 text-muted">{line}</p>
    </header>
  );
}

function Stat({ value, label, href, hot }: { value: number | undefined; label: string; href: string; hot?: boolean }) {
  return (
    <Link href={href} className="stat">
      <p className={`stat-value ${hot && value ? "text-signal" : ""}`}>{value === undefined ? "–" : value.toLocaleString()}</p>
      <p className="stat-label">{label}</p>
    </Link>
  );
}
