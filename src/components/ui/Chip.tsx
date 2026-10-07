const tones = {
  rep: "bg-[#e8eef7] text-[#1f3f6b]",
  new: "bg-paper text-muted ring-1 ring-line",
  contacted: "bg-[#eaf1f8] text-[#1f4f7a]",
  appointment: "bg-[#fdf3e2] text-[#7a4a06]",
  purchased: "bg-go-soft text-go",
  lost: "bg-paper text-muted ring-1 ring-line line-through decoration-muted/50",
  needs_review: "bg-[#fdecee] text-signal-dark",
  approved: "bg-go-soft text-go",
  denied: "bg-[#eceef1] text-[#3a404a]",
  returning: "bg-go-soft text-go",
  out: "bg-[#fdf3e2] text-[#7a4a06]",
  neutral: "bg-paper text-muted ring-1 ring-line",
} as const;
export type ChipTone = keyof typeof tones;

export default function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${tones[tone]}`}>{children}</span>;
}
