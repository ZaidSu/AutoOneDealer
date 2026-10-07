"use client";
import { usePreview } from "@/components/preview/PreviewContext";
import { fileUrlLocal } from "@/lib/preview/store";
import Icon from "./Icon";

// Opens an uploaded invoice, receipt or certificate. Live: served only to signed-in people. Preview: read from this browser.
export default function FileLink({ id, label = "View" }: { id: string | null; label?: string }) {
  const { enabled } = usePreview();
  if (!id) return <span className="text-faint">None</span>;
  const content = <><Icon name="file" className="size-3.5" /> {label}</>;
  if (!enabled) {
    return <a href={`/api/files/${id}`} target="_blank" rel="noopener" className="link-btn inline-flex items-center gap-1">{content}</a>;
  }
  return (
    <button type="button" className="link-btn inline-flex items-center gap-1"
      onClick={async () => {
        const tab = window.open("", "_blank"); // opened first so pop-up blockers allow it
        const url = await fileUrlLocal(id).catch(() => null);
        if (url && tab) tab.location.href = url;
        else { tab?.close(); alert("That file isn't on this device. Preview files stay in the browser that uploaded them."); }
      }}>
      {content}
    </button>
  );
}
