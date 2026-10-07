"use client";
import { usePreview } from "@/components/preview/PreviewContext";
import { toCsv } from "@/lib/csv";
import { buildExport, buildPackage } from "@/lib/exports";
import { makeZip } from "@/lib/zip";
import Icon from "./Icon";

// A "Download CSV" button. Live: the server builds the file. Preview: it's built here from the data in this browser.
export default function ExportLink({ kind, year, id, label = "Download CSV", icon }: {
  kind: string; year?: string | number; id?: string; label?: string; icon?: boolean;
}) {
  const { enabled, data } = usePreview();
  const content = <>{icon && <Icon name="download" className="size-4" />}{label}</>;
  if (!enabled) {
    const qs = new URLSearchParams({ kind, ...(year !== undefined ? { year: String(year) } : {}), ...(id ? { id } : {}) });
    return <a className="btn btn-sm" href={`/api/export?${qs}`}>{content}</a>;
  }
  return (
    <button type="button" className="btn btn-sm" disabled={!data}
      onClick={() => {
        if (!data) return;
        const y = /^\d{4}$/.test(String(year)) ? Number(year) : null;
        const a = document.createElement("a");
        if (kind === "package") {
          if (y === null) return;
          const pack = buildPackage(data, y);
          const enc = new TextEncoder();
          a.href = URL.createObjectURL(new Blob([makeZip(pack.files.map((f) => ({ name: f.name, data: enc.encode(f.content) }))) as BlobPart], { type: "application/zip" }));
          a.download = `${pack.name}.zip`;
        } else {
          const out = buildExport(kind, data, y, id);
          if (!out) return;
          a.href = URL.createObjectURL(new Blob(["\uFEFF" + toCsv(out.rows)], { type: "text/csv;charset=utf-8" }));
          a.download = `${out.name}.csv`;
        }
        a.click();
        URL.revokeObjectURL(a.href);
      }}>
      {content}
    </button>
  );
}
