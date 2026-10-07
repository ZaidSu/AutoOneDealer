import Link from "next/link";
import Icon from "@/components/layout/Icon";

/** Empty state for AI features that aren't switched on yet: what will show here, and what to do meanwhile. */
export default function NotSetUp({ icon, title, body, next }: { icon: string; title: string; body: string; next?: { href: string; label: string } }) {
  return (
    <section className="panel flex max-w-3xl flex-col items-start gap-3 p-6 sm:flex-row sm:gap-5">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-muted"><Icon name={icon} className="size-5" /></span>
      <div>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-prose text-muted">{body}</p>
        {next && <Link href={next.href} className="btn btn-sm mt-4">{next.label}</Link>}
      </div>
    </section>
  );
}
