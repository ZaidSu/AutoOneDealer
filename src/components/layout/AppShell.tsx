"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { reset } from "@/lib/preview/store";

type NavItem = { href: string; label: string; icon: string };

// The sidebar: the four things you use, and everything else tucked under "More".
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/invoices", label: "Invoices", icon: "invoices" },
  { href: "/items", label: "Items", icon: "items" },
  { href: "/expenses", label: "Expenses", icon: "expenses" },
  { href: "/taxes", label: "Taxes", icon: "taxes" },
];
const SOFTWARE: NavItem[] = [
  { href: "/income", label: "Income", icon: "income" },
  { href: "/projects", label: "Projects", icon: "projects" },
];
const MORE: NavItem[] = [
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/contractors", label: "Contractors", icon: "contractors" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/quarters", label: "Quarters", icon: "quarters" },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

export default function AppShell({ name, roleLabel, preview, children }: { name: string; roleLabel: string; preview?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <Brand />
        <button
          type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sidebar"
          className="rounded-lg px-3 py-1.5 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/10"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col bg-ink text-side-ink transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center px-5"><Brand /></div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                  <li key={item.href}>
                    <Link
                      href={item.href} aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                        active ? "bg-white/12 text-white" : "hover:bg-white/7 hover:text-white"
                      }`}
                    >
                      <Icon name={item.icon} className={`size-[18px] ${active ? "text-accent" : "opacity-80"}`} />
                      {item.label}
                    </Link>
                  </li>
              );
            })}
          </ul>
          <p className="mt-5 border-t border-white/12 px-3 pb-1 pt-4 text-[11px] font-extrabold uppercase tracking-wider opacity-60">Software</p>
          <ul className="space-y-0.5">
            {SOFTWARE.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                  <li key={item.href}>
                    <Link
                      href={item.href} aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                        active ? "bg-white/12 text-white" : "hover:bg-white/7 hover:text-white"
                      }`}
                    >
                      <Icon name={item.icon} className={`size-[18px] ${active ? "text-accent" : "opacity-80"}`} />
                      {item.label}
                    </Link>
                  </li>
              );
            })}
          </ul>
          <details className="mt-4" open={MORE.some((m) => isActive(pathname, m.href))}>
            <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold opacity-80 hover:text-white">More</summary>
            <ul className="mt-1 space-y-0.5">
              {MORE.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href} aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                        active ? "bg-white/12 text-white" : "hover:bg-white/7 hover:text-white"
                      }`}
                    >
                      <Icon name={item.icon} className={`size-[18px] ${active ? "text-accent" : "opacity-80"}`} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        </nav>
        <div className="shrink-0 border-t border-white/12 p-4">
          {preview && (
            <div className="mb-3 rounded-lg bg-accent/15 p-2.5 text-xs leading-snug">
              <span className="rounded-full bg-accent px-2 py-0.5 font-extrabold text-ink">Preview mode</span>
              <p className="mt-1.5">Nothing is connected yet. What you enter is saved in this browser only.</p>
              <button type="button" className="mt-1 font-bold text-white underline"
                onClick={() => { if (confirm("Erase everything you entered in preview mode on this browser?")) reset(); }}>Erase preview data</button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-ink">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{name}</p>
              <p className="truncate text-xs">{roleLabel}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
            <a href="/" className="text-white hover:underline">Website</a>
            <form action="/api/logout" method="post">
              <button type="submit" className="flex items-center gap-1.5 text-white hover:underline">
                <Icon name="logout" className="size-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-5 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-9">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 [&>*]:min-w-0">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/invoices" className="flex min-w-0 items-center gap-2.5 text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="size-8 shrink-0" />
      <span className="text-[17px] font-extrabold leading-tight tracking-tight">Marketplace Wholesale</span>
    </Link>
  );
}
