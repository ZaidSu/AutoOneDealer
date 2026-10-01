// A lead source (Cars.com, CarGurus, ...) with its own color dot, matching the colors on Analytics.
import { sourceColor } from "@/lib/utils/sourceColors";

export default function SourceBadge({ source, size = "md" }: { source: string | null | undefined; size?: "sm" | "md" }) {
  const label = source || "Unknown source";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white font-medium text-ink ring-1 ring-line ${size === "sm" ? "px-2 py-px text-xs" : "px-2.5 py-0.5 text-[13px]"}`}>
      <span aria-hidden className={`${size === "sm" ? "size-1.5" : "size-2"} shrink-0 rounded-full`} style={{ background: source ? sourceColor(source) : "#ced4da" }} />
      {label}
    </span>
  );
}
