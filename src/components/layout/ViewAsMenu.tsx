"use client";
import { useTransition } from "react";
import { setViewAsAction } from "@/app/actions";
import { clearSavedData } from "@/lib/client/live";

/** Developer only: switch between your own view and what the owner, a manager or a salesperson sees. */
export default function ViewAsMenu({ current }: { current: string | null }) {
  const [pending, start] = useTransition();
  const change = (value: string) => start(async () => {
    await setViewAsAction(value);
    clearSavedData(); // so no page keeps showing data from the other view
    window.location.reload();
  });
  return (
    <label className={`ml-auto flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ${current ? "bg-warn-soft ring-signal/40" : "bg-white ring-line"}`}>
      <span className="font-semibold text-muted">Preview</span>
      <select value={current ?? "me"} disabled={pending} onChange={(e) => change(e.target.value)} aria-label="Preview the app as"
        className="bg-transparent font-semibold text-ink outline-none">
        <option value="me">My view (developer)</option>
        <option value="owner">What the owner sees</option>
        <option value="manager">What a manager sees</option>
        <option value="salesperson">What a salesperson sees</option>
      </select>
    </label>
  );
}
