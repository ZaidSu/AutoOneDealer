// Turns rows into a CSV file's text. Cells that start with = + - @ are prefixed so spreadsheets don't run them as formulas.
export function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? "");
    if (/^[=+@]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s)))) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
