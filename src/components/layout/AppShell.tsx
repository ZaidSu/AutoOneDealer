"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AutoSync from "./AutoSync";
import CommandSearch from "./CommandSearch";
import Icon from "./Icon";
import { clearSavedData, preloadData, useLive } from "@/lib/client/live";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { id: string; label: string; icon: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

// The sidebar: a few pages on their own, the rest in groups that open and close.
const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/todo", label: "To do", icon: "todo" },
  {
    id: "sales", label: "Sales", icon: "sales", items: [
      { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
      { href: "/customers", label: "Customers", icon: "customers" },
      { href: "/inventory", label: "Inventory", icon: "store" },
      { href: "/appointments", label: "Appointments", icon: "appointments" },
    ],
  },
  {
    id: "leads", label: "Leads", icon: "leads", items: [
      { href: "/leads", label: "All leads", icon: "leads" },
      { href: "/credit-applications", label: "Credit applications", icon: "credit" },
      { href: "/inbox", label: "Inbox", icon: "inbox" },
    ],
  },
  {
    id: "aiemail", label: "AI emails", icon: "mail", items: [
      { href: "/ai/emails", label: "Replies", icon: "mail" },
      { href: "/ai/emails/history", label: "History", icon: "mail" },
      { href: "/ai/emails/settings", label: "Settings", icon: "mail" },
    ],
  },
  {
    id: "aitext", label: "AI texts", icon: "chat", items: [
      { href: "/ai/texts", label: "Conversations", icon: "chat" },
      { href: "/ai/texts/history", label: "History", icon: "chat" },
      { href: "/ai/texts/settings", label: "Settings", icon: "chat" },
    ],
  },
  {
    id: "ai", label: "AI setup", icon: "ai", items: [
      { href: "/ai/train", label: "Train your AI", icon: "ai" },
      { href: "/ai/dealership", label: "Dealership info", icon: "store" },
      { href: "/ai/phone-numbers", label: "Phone numbers", icon: "phone" },
      { href: "/ai/automations", label: "Automations", icon: "automations" },
    ],
  },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
];
const FOOTER: NavItem[] = [
  { href: "/billing", label: "Billing", icon: "credit" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/developer", label: "Developer", icon: "developer" },
];
// The pages people open most load in the background, so clicking them is instant.
const PRELOAD = new Set(["/dashboard", "/pipeline", "/customers", "/appointments", "/leads"]);
const DEFAULT_OPEN: Record<string, boolean> = { sales: true, leads: true, aiemail: false, aitext: false, ai: false };
const OPEN_KEY = "ad:nav-open";

const isGroup = (e: NavEntry): e is NavGroup => "items" in e;
const ALL_HREFS = [...NAV.flatMap((e) => (isGroup(e) ? e.items.map((i) => i.href) : [e.href])), ...FOOTER.map((i) => i.href)];
const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
/** The link for the page you're on. When two links both match (like /ai/emails and /ai/emails/history), only the longer one lights up. */
const isActive = (pathname: string, href: string) => under(pathname, href) && !ALL_HREFS.some((h) => h.length > href.length && under(pathname, h));

type Me = { name: string; role?: string; roleLabel: string; dealershipName: string };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const me = useLive<Me>("/api/me", { every: 10 * 60_000 }).data;
  const dealershipName = me?.dealershipName ?? "Auto One Motors";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Brand dealershipName={dealershipName} />
        <button
          type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sidebar"
          className="rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-line hover:bg-paper"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col border-r border-line bg-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <Brand dealershipName={dealershipName} />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          <Nav pathname={pathname} />
        </nav>
        <div className="shrink-0 border-t border-line px-3 py-3">
          <ul className="space-y-0.5">
            {FOOTER.filter((item) => item.href !== "/billing" || me?.role === "owner" || me?.role === "developer")
              .map((item) => <li key={item.href}><NavLink item={item} active={isActive(pathname, item.href)} /></li>)}
          </ul>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-paper px-3 py-2.5">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-graphite text-sm font-semibold text-white">
              {(me?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{me?.name ?? ""}</p>
              <p className="truncate text-xs text-muted">{me?.roleLabel ?? ""}</p>
            </div>
            <form action="/api/logout" method="post" onSubmit={() => clearSavedData()}>
              <button type="submit" title="Sign out" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-muted hover:bg-white hover:text-ink">
                <Icon name="logout" className="size-4" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center gap-3 px-5 pt-5 sm:px-8 lg:px-12 lg:pt-7">
          <CommandSearch />
        </div>
        <main className="min-w-0 px-5 pt-6 pb-12 sm:px-8 lg:px-12">{children}</main>
      </div>
      <AutoSync />
    </div>
  );
}

function Brand({ dealershipName }: { dealershipName: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="size-2.5 shrink-0 rounded-[2px] bg-signal" />
      <span className="font-condensed text-[22px] font-semibold leading-none tracking-wide">AutoDash</span>
      <span className="truncate text-sm text-muted">{dealershipName}</span>
    </Link>
  );
}

function Nav({ pathname }: { pathname: string }) {
  // The sidebar numbers wait a few seconds after the page opens, so the page's own data gets the database first.
  const [countsReady, setCountsReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCountsReady(true), 3500); return () => clearTimeout(t); }, []);
  const todoCount = useLive<{ count: number; urgent?: number }>("/api/todo/count", { every: 3 * 60_000, enabled: countsReady }).data;
  const inventoryCount = useLive<{ count: number }>("/api/inventory/count", { every: 5 * 60_000, enabled: countsReady }).data;
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
      {NAV.map((entry) => {
        if (!isGroup(entry)) return <li key={entry.href}><NavLink item={entry} active={isActive(pathname, entry.href)} badge={entry.href === "/todo" ? todoCount?.count : undefined} urgent={entry.href === "/todo" && Boolean(todoCount?.urgent)} /></li>;
        const hasActive = entry.items.some((i) => isActive(pathname, i.href));
        const expanded = hasActive || Boolean(openGroups[entry.id]);
        return (
          <li key={entry.id} className="pt-2">
            <button
              type="button" onClick={() => toggle(entry.id)} aria-expanded={expanded} aria-controls={`nav-${entry.id}`}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] font-semibold text-ink hover:bg-paper"
            >
              <Icon name={entry.icon} className="size-[18px] text-muted" />
              <span className="flex-1">{entry.label}</span>
              <Icon name="chevron" className="nav-chevron size-4 text-faint" />
            </button>
            {expanded && (
              <ul id={`nav-${entry.id}`} className="mt-0.5 space-y-0.5 border-l border-line pl-2 ml-[21px]">
                {entry.items.map((item) => <li key={item.href}><NavLink item={item} active={isActive(pathname, item.href)} nested badge={item.href === "/inventory" ? inventoryCount?.count : undefined} /></li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NavLink({ item, active, nested, badge, urgent }: { item: NavItem; active: boolean; nested?: boolean; badge?: number; urgent?: boolean }) {
  return (
    <Link
      prefetch={PRELOAD.has(item.href)}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors ${
        active ? "bg-signal-soft font-semibold text-signal-dark" : "text-muted hover:bg-paper hover:text-ink"
      }`}
    >
      {!nested && <Icon name={item.icon} className={`size-[18px] ${active ? "text-signal" : ""}`} />}
      <span className="flex-1">{item.label}</span>
      {badge ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${urgent ? "bg-signal text-white" : "bg-graphite-3/20 text-ink"}`}>{badge}</span> : null}
    </Link>
  );
}
