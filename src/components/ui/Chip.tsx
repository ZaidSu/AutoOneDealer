const tones = {
  rep: "bg-grape-soft text-[#4d2bb3]",
  new: "bg-azure-soft text-[#1f4fb8]",
  contacted: "bg-lagoon-soft text-[#07706b]",
  appointment: "bg-sun-soft text-[#8a5300]",
  purchased: "bg-go-soft text-go",
  lost: "bg-paper text-muted ring-1 ring-line line-through decoration-muted/50",
  needs_review: "bg-signal-soft text-signal-dark",
  approved: "bg-go-soft text-go",
  denied: "bg-[#eceef4] text-[#3a4258]",
  returning: "bg-berry-soft text-[#a4204f]",
  out: "bg-sun-soft text-[#8a5300]",
  neutral: "bg-paper text-muted ring-1 ring-line",
} as const;
export type ChipTone = keyof typeof tones;

export default function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${tones[tone]}`}>{children}</span>;
}
