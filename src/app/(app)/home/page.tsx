import type { Metadata } from "next";
import Link from "next/link";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState } from "@/lib/db";
import { registrationCounts } from "@/lib/registration/store";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const staff = await requirePageStaff();
  const reg = (await dbState()) === "ready" ? await registrationCounts().catch(() => null) : null;
  const first = staff.name.trim().split(/\s+/)[0];
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(new Date())) % 24;
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl pt-4 sm:pt-10">
      <span aria-hidden className="mb-3 block h-1.5 w-12 rounded-full bg-gradient-to-r from-[#d7163b] via-[#f08c00] to-[#2f6fed]" />
      <h1 className="page-title">{hello}, {first}.</h1>
      <p className="mt-1.5 text-lg text-muted">What do you want to work on?</p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Link href="/dashboard" className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f6fed] via-[#3b5bdb] to-[#7048e8] p-7 text-white shadow-[0_24px_50px_-24px_rgba(47,111,237,0.9)] transition-transform hover:-translate-y-1">
          <span aria-hidden className="absolute -top-16 -right-16 size-56 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -bottom-20 right-10 size-44 rounded-full bg-white/10" />
          <div className="relative">
            <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-white/20 text-2xl">★</span>
            <h2 className="mt-5 font-condensed text-4xl font-semibold leading-none">Manage Leads</h2>
            <p className="mt-2 max-w-xs text-white/85">Leads, customers, texts, emails, appointments and inventory.</p>
          </div>
          <span className="relative mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-white/20 px-4 py-2 font-semibold group-hover:bg-white/30">Open dashboard →</span>
        </Link>

        <Link href="/registration" className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#0ca7a0] via-[#0e9f8e] to-[#12a150] p-7 text-white shadow-[0_24px_50px_-24px_rgba(12,167,160,0.9)] transition-transform hover:-translate-y-1">
          <span aria-hidden className="absolute -top-16 -right-16 size-56 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -bottom-20 right-10 size-44 rounded-full bg-white/10" />
          <div className="relative">
            <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-white/20 text-2xl">▤</span>
            <h2 className="mt-5 font-condensed text-4xl font-semibold leading-none">Registration</h2>
            <p className="mt-2 max-w-xs text-white/85">Registration stickers: pickups, copies and deferred payments.</p>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            {reg && (
              <>
                <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">{reg.pickup} to pick up</span>
                <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">{reg.copy} need a copy</span>
                {reg.deferred > 0 && <span className="rounded-full bg-[#d7163b] px-3 py-1 text-sm font-bold">{reg.deferred} deferred</span>}
              </>
            )}
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 font-semibold group-hover:bg-white/30">Open →</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
