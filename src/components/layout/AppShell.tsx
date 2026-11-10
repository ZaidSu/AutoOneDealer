"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AutoSync from "./AutoSync";
import CommandSearch from "./CommandSearch";
import Icon from "./Icon";
import ViewAsMenu from "./ViewAsMenu";
import { clearSavedData, preloadData, useLive } from "@/lib/client/live";

type NavItem = { href: string; label: string; icon: string; tone?: string };
type NavGroup = { id: string; label: string; icon: string; tone: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

// The sidebar: plain words, a few quiet headings, always visible. The less-used pages are tucked under one "More" button.
type NavHeading = { heading: string };
const NAV: (NavEntry | NavHeading)[] = [
  { href: "/home", label: "Home", icon: "home", tone: "#f08c00" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", tone: "#5b7cfa" },
  { href: "/todo", label: "To do", icon: "todo", tone: "#ff5d73" },
  { heading: "People" },
  { href: "/ai/texts", label: "Texts", icon: "chat", tone: "#19c3bb" },
  { href: "/ai/emails", label: "Emails", icon: "mail", tone: "#9b7bff" },
  { href: "/leads", label: "Leads", icon: "leads", tone: "#f59f00" },
  { href: "/contacts", label: "Contacts", icon: "customers", tone: "#5b8def" },
  { href: "/customers", label: "Customers", icon: "customers", tone: "#5b8def" },
  { href: "/follow-ups", label: "Follow-ups", icon: "appointments", tone: "#ff8a3d" },
  { heading: "Dealership" },
  { href: "/inventory", label: "Cars", icon: "store", tone: "#4dabf7" },
  { href: "/appointments", label: "Appointments", icon: "appointments", tone: "#f06595" },
  { href: "/analytics", label: "Analytics", icon: "analytics", tone: "#38d98a" },
  {
    id: "more", label: "More", icon: "settings", tone: "#8792ad", items: [
      { href: "/credit-applications", label: "Credit applications", icon: "credit" },
      { href: "/inbox", label: "Inbox", icon: "inbox" },
      { href: "/ai/texts/history", label: "Text history", icon: "chat" },
      { href: "/ai/emails/history", label: "Email history", icon: "mail" },
      { href: "/ai/texts/settings", label: "Text settings", icon: "chat" },
      { href: "/ai/emails/settings", label: "Email settings", icon: "mail" },
      { href: "/ai/train", label: "Train your AI", icon: "ai" },
      { href: "/ai/dealership", label: "Dealership info", icon: "store" },
      { href: "/ai/phone-numbers", label: "Phone numbers", icon: "phone" },
      { href: "/ai/automations", label: "Automations", icon: "automations" },
    ],
  },
];
// Registration is its own small area with its own menu: no leads, no AI setup, just stickers and sales.
const REG_NAV: NavEntry[] = [
  { href: "/home", label: "Back to Home", icon: "home", tone: "#f08c00" },
  { href: "/registration", label: "Registrations", icon: "registration", tone: "#0ca7a0" },
  { href: "/registration/sales", label: "Recent sales", icon: "store", tone: "#2f6fed" },
  { href: "/registration/sales#log-sale", label: "Log a sale", icon: "credit", tone: "#d7163b" },
];
const FOOTER: NavItem[] = [
  { href: "/billing", label: "Billing", icon: "credit", tone: "#12a150" },
  { href: "/settings", label: "Settings", icon: "settings", tone: "#8792ad" },
  { href: "/developer", label: "Developer", icon: "developer", tone: "#9b6bff" },
];
// The pages people open most load in the background, so clicking them is instant.
const PRELOAD = new Set(["/dashboard", "/contacts", "/customers", "/appointments", "/leads", "/ai/texts"]);
const DEFAULT_OPEN: Record<string, boolean> = { more: false };
const OPEN_KEY = "ad:nav-open2";

const isHeading = (e: NavEntry | NavHeading): e is NavHeading => "heading" in e;
const isGroup = (e: NavEntry | NavHeading): e is NavGroup => "items" in e;
const ALL_HREFS = [...NAV, ...REG_NAV].flatMap((e) => (isHeading(e) ? [] : isGroup(e) ? e.items.map((i) => i.href) : [e.href])).concat(FOOTER.map((i) => i.href));
const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
/** The link for the page you're on. When two links both match (like /ai/emails and /ai/emails/history), only the longer one lights up. */
const isActive = (pathname: string, href: string) => under(pathname, href) && !ALL_HREFS.some((h) => h.length > href.length && under(pathname, h));

type Me = { name: string; role?: string; roleLabel: string; dealershipName: string; viewAs?: string | null; canPreview?: boolean };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const me = useLive<Me>("/api/me", { every: 10 * 60_000 }).data;
  const status = useLive<{ gmail: string | null }>("/api/status", { every: 5 * 60_000 }).data;
  const dealershipName = me?.dealershipName ?? "Auto One Motors";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const regMode = pathname === "/registration" || pathname.startsWith("/registration/");

  // Shortly after any page opens, fetch the Dashboard and Customers data into the browser's saved copy.
  useEffect(() => {
    const t = setTimeout(() => { preloadData("/api/dashboard"); preloadData("/api/customers"); }, 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* Phone and tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-[#141a33] px-4 text-white lg:hidden">
        <Brand dealershipName={dealershipName} />
        <button
          type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sidebar"
          className="rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/10"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-[#0b1020]/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="sidebar"
        className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <Brand dealershipName={regMode ? "Registration" : dealershipName} />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          <Nav pathname={pathname} regMode={regMode} />
        </nav>
        <div className="shrink-0 border-t border-white/10 px-3 py-3">
          <ul className="space-y-0.5">
            {(regMode ? [] : FOOTER).filter((item) => (item.href !== "/billing" || me?.role === "owner" || me?.role === "developer") && (item.href !== "/developer" || me?.role === "developer"))
              .map((item) => <li key={item.href}><NavLink item={item} active={isActive(pathname, item.href)} /></li>)}
          </ul>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2f6fed] to-[#7048e8] text-sm font-semibold text-white">
              {(me?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{me?.name ?? ""}</p>
              <p className="truncate text-xs text-[#9aa4c4]">{me?.roleLabel ?? ""}</p>
            </div>
            <form action="/api/logout" method="post" onSubmit={() => clearSavedData()}>
              <button type="submit" title="Sign out" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-[#9aa4c4] hover:bg-white/10 hover:text-white">
                <Icon name="logout" className="size-4" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {status?.gmail && (
          <div role="alert" className="border-b border-signal/30 bg-warn-soft px-5 py-3 text-[15px] sm:px-8 lg:px-12">
            <span className="font-semibold text-signal">Email is not working.</span> AutoDash can&apos;t read or answer lead emails right now (texts still work). {status.gmail}{" "}
            <Link href="/settings" className="font-semibold text-signal underline">Reconnect Gmail</Link>
          </div>
        )}
        <div className="flex items-center gap-3 px-5 pt-5 sm:px-8 lg:px-12 lg:pt-7">
          {regMode ? <div className="flex-1" /> : <CommandSearch />}
          {me?.canPreview && <ViewAsMenu current={me.viewAs ?? null} />}
        </div>
        <main className="min-w-0 px-5 pt-6 pb-12 sm:px-8 lg:px-12">{children}</main>
      </div>
      <AutoSync />
    </div>
  );
}

function Brand({ dealershipName }: { dealershipName: string }) {
  return (
    <Link href="/home" className="flex min-w-0 items-center gap-2.5 text-white">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#e11d48] to-[#f08c00] font-condensed text-lg font-semibold leading-none shadow-[0_4px_14px_-4px_rgba(225,29,72,0.7)]">A</span>
      <span className="font-condensed text-[22px] font-semibold leading-none tracking-wide">AutoDash</span>
      <span className="truncate text-sm text-[#9aa4c4]">{dealershipName}</span>
    </Link>
  );
}

function Nav({ pathname, regMode }: { pathname: string; regMode: boolean }) {
  // The sidebar numbers wait a few seconds after the page opens, so the page's own data gets the database first.
  const [countsReady, setCountsReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCountsReady(true), 3500); return () => clearTimeout(t); }, []);
  const todoCount = useLive<{ count: number; urgent?: number }>("/api/todo/count", { every: 3 * 60_000, enabled: countsReady && !regMode }).data;
  const inventoryCount = useLive<{ count: number }>("/api/inventory/count", { every: 5 * 60_000, enabled: countsReady && !regMode }).data;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  // Remember which groups each person keeps open.
  useEffect(() => {
    try { const saved = localStorage.getItem(OPEN_KEY); if (saved) setOpenGroups({ ...DEFAULT_OPEN, ...JSON.parse(saved) }); } catch { /* ignore */ }
  }, []);
  const toggle = (id: string) => setOpenGroups((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  return (
    <ul className="space-y-0.5">
      {(regMode ? REG_NAV : NAV).map((entry) => {
        if (isHeading(entry)) return <li key={entry.heading} className="px-3 pt-5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6f7aa0]" aria-hidden>{entry.heading}</li>;
        if (!isGroup(entry)) return <li key={entry.href}><NavLink item={entry} active={isActive(pathname, entry.href)} badge={entry.href === "/todo" ? todoCount?.count : entry.href === "/inventory" ? inventoryCount?.count : undefined} urgent={entry.href === "/todo" || entry.href === "/inventory"} /></li>;
        const hasActive = entry.items.some((i) => isActive(pathname, i.href));
        const expanded = hasActive || Boolean(openGroups[entry.id]);
        return (
          <li key={entry.id} className="pt-3">
            <button
              type="button" onClick={() => toggle(entry.id)} aria-expanded={expanded} aria-controls={`nav-${entry.id}`}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base text-[#b4bdd6] hover:bg-white/[0.07] hover:text-white"
            >
              <span aria-hidden className="grid size-7 shrink-0 place-items-center text-[#7f8bb0]"><Icon name={entry.icon} className="size-[22px]" /></span>
              <span className="flex-1">{entry.label}</span>
              <Icon name="chevron" className="nav-chevron size-4 text-[#7c87aa]" />
            </button>
            {expanded && (
              <ul id={`nav-${entry.id}`} className="mt-0.5 ml-[26px] space-y-0.5 border-l border-white/10 pl-2">
                {entry.items.map((item) => <li key={item.href}><NavLink item={{ ...item, tone: entry.tone }} active={isActive(pathname, item.href)} nested badge={item.href === "/inventory" ? inventoryCount?.count : undefined} urgent={item.href === "/inventory"} /></li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NavLink({ item, active, nested, badge, urgent }: { item: NavItem; active: boolean; nested?: boolean; badge?: number; urgent?: boolean }) {
  const tone = item.tone ?? "#8792ad";
  return (
    <Link
      prefetch={PRELOAD.has(item.href)}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-base transition-colors ${
        active ? "bg-white/[0.12] font-semibold text-white" : "text-[#b4bdd6] hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: tone }} />}
      {nested ? <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: tone, opacity: active ? 1 : 0.55 }} /> : <span aria-hidden className="grid size-7 shrink-0 place-items-center" style={{ color: active ? tone : "#7f8bb0" }}><Icon name={item.icon} className="size-[22px]" /></span>}
      <span className="flex-1">{item.label}</span>
      {badge ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${urgent ? "bg-[#e11d48] text-white" : "bg-white/15 text-white"}`}>{badge}</span> : null}
    </Link>
  );
}
