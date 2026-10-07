import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export const H2 = ({ children, id }: { children: ReactNode; id?: string }) => <h2 id={id} className="mb-2 mt-9 text-xl font-extrabold">{children}</h2>;
export const P = ({ children }: { children: ReactNode }) => <p className="mt-2 text-ink-2">{children}</p>;
export const UL = ({ children }: { children: ReactNode }) => <ul className="mt-2 list-disc space-y-1.5 pl-6 text-ink-2">{children}</ul>;
export const Callout = ({ children }: { children: ReactNode }) => <div className="mt-3 space-y-2 rounded-r-xl border-l-4 border-accent bg-paper px-5 py-4 text-ink-2">{children}</div>;

/** Plain public page for policies and terms. No sign-in needed (carriers and customers have to be able to read them). */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="bg-white">
      <SiteHeader />
      <main className="mx-auto w-[min(760px,100%-40px)] py-14 text-[16.5px] leading-relaxed">
        <h1 className="text-[clamp(2rem,4vw,2.6rem)] font-extrabold tracking-tight">{title}</h1>
        <p className="mb-8 mt-1 text-muted">Last updated: {updated}</p>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
