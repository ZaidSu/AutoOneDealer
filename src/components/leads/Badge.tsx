const styles = {
  application: "bg-[#fdecee] text-signal-dark",
  inquiry: "bg-[#eaf1f8] text-[#1f4f7a]",
  neutral: "bg-paper text-muted ring-1 ring-line",
} as const;

export default function Badge({ tone, children }: { tone: keyof typeof styles; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium ${styles[tone]}`}>{children}</span>;
}
