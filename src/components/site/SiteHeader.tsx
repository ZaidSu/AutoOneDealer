"use client";
import Link from "next/link";
import { useState } from "react";
import { SITE } from "@/lib/legal/config";

const LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#how", label: "How we work" },
  { href: "/#data", label: "Your data" },
  { href: "/login", label: "Sign in" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-[68px] w-[min(1080px,100%-40px)] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-[30px]" />
          <span className="leading-tight">{SITE.company}<small className="block text-xs font-semibold tracking-wide text-muted">{SITE.tagline}</small></span>
        </Link>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="site-nav"
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold md:hidden">{open ? "Close" : "Menu"}</button>
        <nav id="site-nav" aria-label="Main"
          className={`${open ? "flex" : "hidden"} absolute left-0 right-0 top-[68px] flex-col items-stretch gap-1 border-b border-line bg-white px-5 pb-4 pt-2 md:static md:flex md:flex-row md:items-center md:border-0 md:p-0`}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[15px] font-semibold text-ink-2 hover:bg-paper hover:text-ink">{l.label}</Link>
          ))}
          <Link href="/#contact" onClick={() => setOpen(false)} className="rounded-lg bg-ink px-3.5 py-2 text-[15px] font-semibold text-white hover:bg-ink-2">Contact us</Link>
        </nav>
      </div>
    </header>
  );
}
