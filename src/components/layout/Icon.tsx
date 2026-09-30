// Small line icons for the sidebar (inline SVG, no icon library to download).
const PATHS: Record<string, string> = {
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  pipeline: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z",
  inbox: "M4 13l2.5-7h11L20 13v6H4zM4 13h4.5l1.5 2.5h4L15.5 13H20",
  leads: "M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z",
  credit: "M3 7h18v10H3zM3 11h18M7 15h3",
  customers: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 010 6.4M18 14.8c2 .8 3.2 2.5 3.5 5.2",
  appointments: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  ai: "M12 3v3M12 18v3M3 12h3M18 12h3M7 7l1.5 1.5M15.5 15.5L17 17M7 17l1.5-1.5M15.5 8.5L17 7M12 9a3 3 0 100 6 3 3 0 000-6z",
  automations: "M13 3L5 14h6l-1 7 8-11h-6z",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 01-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 01-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 010-2.9L4.6 9.3l2-3.4 1.9.7a7 7 0 012-1.2L10.8 3h4l.3 2.4a7 7 0 012 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 010 2.9z",
  developer: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
};

export default function Icon({ name, className = "size-[18px]" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
