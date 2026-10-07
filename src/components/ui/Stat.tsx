export default function Stat({ label, value, sub, strong, bad, href }: {
  label: string; value: string; sub?: string; strong?: boolean; bad?: boolean; href?: string;
}) {
  const body = (
    <>
      <p className="stat-label text-sm text-muted">{label}</p>
      <p className={`stat-value ${bad ? "text-bad" : ""}`}>{value}</p>
      {sub ? <p className="stat-sub mt-0.5 text-[13px] text-muted">{sub}</p> : null}
    </>
  );
  const cls = `stat ${strong ? "stat-strong" : ""}`;
  return href ? <a href={href} className={cls}>{body}</a> : <div className={cls}>{body}</div>;
}
