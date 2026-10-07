import Link from "next/link";
import { quarterBanner } from "@/lib/calc";
import type { Data } from "@/lib/types";
import Icon from "./Icon";

/** The reminder at the top of the working pages: a quarter that's closing soon, or ended and isn't finalized. */
export default function QuarterBanner({ data, today }: { data: Data; today: string }) {
  const b = quarterBanner(data, today);
  if (!b) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#f0d9a8] bg-accent-soft px-4 py-3 text-[15px] text-[#6b4a00]">
      <Icon name="quarters" className="size-[18px] shrink-0" />
      <span className="flex-1 font-semibold">{b.text}</span>
      <Link href="/quarters" className="font-bold underline">{b.kind === "ended" ? "Review and finalize" : "Review it"}</Link>
    </div>
  );
}
