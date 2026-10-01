import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal/config";

const LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/sms-terms", label: "Text Message Terms" },
  { href: "/email-terms", label: "Email Terms" },
  { href: "/terms", label: "AutoDash Service Agreement" },
];

export const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-8 text-xl font-semibold">{children}</h2>;
export const P = ({ children }: { children: ReactNode }) => <p className="mt-3">{children}</p>;
export const UL = ({ children }: { children: ReactNode }) => <ul className="mt-3 list-disc space-y-1.5 pl-6">{children}</ul>;
/** Louder text for the clauses that must be conspicuous (limits on liability). */
export const Caps = ({ children }: { children: ReactNode }) => <p className="mt-3 font-semibold uppercase leading-snug tracking-wide text-[13.5px]">{children}</p>;

/** Plain public page for policies and terms. No sign-in needed (carriers and customers have to be able to read them). */
export default function LegalPage({ title, brand, children }: { title: string; brand?: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <span className="font-condensed text-[22px] font-semibold tracking-wide">{brand ?? LEGAL.dealer}</span>
          <nav aria-label="Legal pages" className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className="font-semibold text-muted hover:text-ink">{l.label}</Link>)}
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-10 text-[16px] leading-relaxed">
        <h1 className="font-condensed text-4xl font-semibold tracking-wide">{title}</h1>
        <p className="mt-1 text-sm text-muted">Effective and last updated {LEGAL.updated}</p>
        {children}
        <p className="mt-12 border-t border-line pt-4 text-sm text-muted">
          {LEGAL.dealerLegal}, doing business as {LEGAL.dealer} · {LEGAL.address} · {LEGAL.phone} · {LEGAL.email}
        </p>
      </article>
    </main>
  );
}
