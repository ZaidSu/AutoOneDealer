export default function Badge({ tone = "plain", children }: { tone?: "plain" | "green" | "amber"; children: React.ReactNode }) {
  return <span className={`badge ${tone === "plain" ? "" : tone}`}>{children}</span>;
}
