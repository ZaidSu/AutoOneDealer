"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; ready: boolean };

// Items marked ready: false keep the familiar navigation visible without pretending the page works yet.
const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", ready: true },
  { href: "/inbox", label: "Inbox", ready: true },
  { href: "/leads", label: "Leads", ready: true },
  { href: "/credit-applications", label: "Credit Applications", ready: true },
  { href: "/customers", label: "Customers", ready: false },
  { href: "/appointments", label: "Appointments", ready: false },
  { href: "/reports", label: "Reports", ready: false },
  { href: "/train-ai", label: "Train your AI", ready: false },
  { href: "/automations", label: "Automations", ready: false },
];
const footerNav: NavItem[] = [
  { href: "/settings", label: "Settings", ready: true },
  { href: "/developer", label: "Developer", ready: true },
];

type Props = { dealershipName: string; staffName: string; roleLabel: string; children: React.ReactNode };

export default function AppShell({ dealershipName, staffName, roleLabel, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-graphite px-4 text-white lg:hidden">
        <Brand dealershipName={dealershipName} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="sidebar"
          className="rounded-md px-3 py-1.5 text-sm font-semibold ring-1 ring-white/20 hover:bg-graphite-2"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-graphite text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center px-5">
          <Brand dealershipName={dealershipName} />
        </div>
        <nav aria-label="Main" className="mt-2 flex-1 overflow-y-auto px-3">
          <NavList items={mainNav} pathname={pathname} />
        </nav>
        <div className="border-t border-white/10 px-3 py-3">
          <NavList items={footerNav} pathname={pathname} />
          <div className="mt-3 px-3 pb-1">
            <p className="truncate text-sm font-semibold">{staffName}</p>
            <p className="text-xs text-white/60">{roleLabel}</p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</main>
    </div>
  );
}

function Brand({ dealershipName }: { dealershipName: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="size-2.5 shrink-0 rounded-[2px] bg-signal" />
      <span className="font-semibold tracking-tight">AutoDash</span>
      <span className="truncate text-sm text-white/55">{dealershipName}</span>
    </Link>
  );
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        if (!item.ready) {
          return (
            <li key={item.href}>
              <span className="flex items-center justify-between rounded-md px-3 py-2 text-[15px] text-white/40" aria-disabled>
                {item.label}
                <span className="text-xs">Soon</span>
              </span>
            </li>
          );
        }
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative block rounded-md px-3 py-2 text-[15px] transition-colors ${
                active ? "bg-graphite-2 font-semibold text-white" : "text-white/75 hover:bg-graphite-2 hover:text-white"
              }`}
            >
              {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-signal" />}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
