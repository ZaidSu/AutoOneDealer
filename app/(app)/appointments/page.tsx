import { requirePageStaff } from "@/lib/auth/guard";
import type { Metadata } from "next";
import Link from "next/link";
import NewAppointment from "@/components/appointments/NewAppointment";
import StatusButtons from "@/components/appointments/StatusButtons";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { dbState } from "@/lib/db";
import { appointmentsBetween, listReps, recentNoShows, type Appointment } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { formatPhone } from "@/lib/format";
import { addDays, dayKey, zonedToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Appointments" };
export const maxDuration = 45;
export const dynamic = "force-dynamic";

const tz = dealership.timeZone;
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageStaff();
  const params = await searchParams;
  const state = await dbState();
  const today = dayKey(Date.now(), tz);

  if (state !== "ready") {
    return (
      <>
        <PageHeader title="Appointments" description="Customer visits for the whole team, in Dallas time." />
        <div className="max-w-2xl"><DbNotice state={state} what="Appointments" /></div>
      </>
    );
  }

  const week = Math.max(-8, Math.min(8, Number(params.week ?? 0) || 0));
  const start = addDays(today, week * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const repId = params.rep ? Number(params.rep) : null;
  const [reps, appointments, noShows] = await Promise.all([
    listReps(),
    appointmentsBetween(zonedToUtc(days[0], "00:00", tz)!, zonedToUtc(addDays(days[6], 1), "00:00", tz)!, repId),
    week === 0 ? recentNoShows(new Date(Date.now() - 14 * 86400000)) : Promise.resolve([]),
  ]);

  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = dayKey(a.startsAt, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }
  const link = (extra: Record<string, string | number | undefined>) => ({
    pathname: "/appointments",
    query: Object.fromEntries(Object.entries({ rep: params.rep, week: week || undefined, ...extra }).filter(([, v]) => v !== undefined && v !== "" && v !== 0)),
  });
  const label = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    const text = dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
    return day === today ? `Today, ${text}` : day === addDays(today, 1) ? `Tomorrow, ${text}` : text;
  };

  return (
    <>
      <PageHeader title="Appointments" description="Customer visits for the whole team, in Dallas time." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <NewAppointment reps={reps.map((r) => ({ id: r.id, name: r.name }))} today={today} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Salesperson" className="flex flex-wrap rounded-md bg-white p-1 ring-1 ring-line">
          <Link href={link({ rep: undefined })} className={`rounded px-3 py-1.5 text-sm font-medium ${!params.rep ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}>Everyone</Link>
          {reps.map((r) => (
            <Link key={r.id} href={link({ rep: String(r.id) })}
              className={`rounded px-3 py-1.5 text-sm font-medium ${params.rep === String(r.id) ? "bg-graphite text-white" : "text-muted hover:text-ink"}`}>{r.name}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link href={link({ week: week - 1 })} className="rounded-md px-3 py-1.5 ring-1 ring-line hover:bg-white">← Earlier</Link>
          {week !== 0 && <Link href={link({ week: undefined })} className="rounded-md px-3 py-1.5 ring-1 ring-line hover:bg-white">This week</Link>}
          <Link href={link({ week: week + 1 })} className="rounded-md px-3 py-1.5 ring-1 ring-line hover:bg-white">Later →</Link>
        </div>
      </div>

      <div className="grid max-w-4xl gap-5">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          if (list.length === 0 && day !== today) return null;
          return (
            <section key={day} aria-label={label(day)}>
              <h2 className={`mb-2 text-sm font-semibold ${day === today ? "text-signal" : "text-muted"}`}>{label(day)}</h2>
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No appointments today.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                  {list.map((a) => (
                    <li key={a.id} className={`grid gap-x-5 gap-y-2 px-4 py-3.5 md:grid-cols-[88px_minmax(0,1fr)_auto] md:items-center ${a.status === "canceled" ? "opacity-60" : ""}`}>
                      <span className="font-semibold tabular-nums">{timeFmt.format(a.startsAt)}</span>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {a.customerKey ? <Link href={`/customers/${a.customerKey}`} className="hover:text-signal hover:underline">{a.customerName}</Link> : a.customerName}
                          <span className="ml-2 text-sm font-normal text-muted">{a.repName ? `with ${a.repName}` : "No salesperson"}</span>
                        </p>
                        <p className="truncate text-sm text-muted">
                          {[a.vehicle, a.phone && formatPhone(a.phone), a.durationMin !== 60 && `${a.durationMin} min`, a.notes].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <StatusButtons id={a.id} status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {appointments.length === 0 && <p className="text-sm text-muted">Nothing else booked {week === 0 ? "this week" : "for this week"}.</p>}

        {noShows.length > 0 && (
          <section aria-labelledby="noshows">
            <h2 id="noshows" className="mb-2 text-sm font-semibold text-muted">No-shows to call back (last 2 weeks)</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
              {noShows.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-semibold">{a.customerName}</span>
                  {a.phone && <a href={`tel:${a.phone}`} className="hover:text-signal hover:underline">{formatPhone(a.phone)}</a>}
                  <span className="text-sm text-muted">missed {timeFmt.format(a.startsAt)} on {dayKey(a.startsAt, tz)}{a.repName ? ` with ${a.repName}` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
