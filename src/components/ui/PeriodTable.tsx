import { money, num, type PeriodRow } from "@/lib/calc";

/** Every month with a subtotal for each quarter and a total for the year: invoices, sales, what the goods cost, and what's left. */
export default function PeriodTable({ rows }: { rows: PeriodRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table compact">
        <thead><tr><th>Period</th><th className="r">Invoices</th><th className="r">Gross sales</th><th className="r">Cost of goods</th><th className="r">Gross profit</th><th className="r">Miles</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.label}`} className={r.kind === "month" ? "" : r.kind === "quarter" ? "bg-paper font-bold" : "bg-[#e9eef5] font-extrabold"}>
              <td>{r.kind === "month" ? r.label : r.kind === "quarter" ? `${r.label} total` : `${r.label} total`}</td>
              <td className="r">{r.invoices ? num(r.invoices) : "\u2014"}</td><td className="r">{r.gross ? money(r.gross) : "\u2014"}</td>
              <td className="r">{r.cogs ? money(r.cogs) : "\u2014"}</td>
              <td className={`r ${r.profit < 0 ? "text-bad" : ""}`}>{r.gross || r.cogs ? money(r.profit) : "\u2014"}</td>
              <td className="r">{r.miles ? num(r.miles) : "\u2014"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
