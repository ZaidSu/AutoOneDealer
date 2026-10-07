"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ActionResult } from "@/app/actions";

export default function DeleteButton({ action, id, confirmText, label = "Delete", after }: {
  action: (id: string) => Promise<ActionResult>; id: string; confirmText: string; label?: string;
  /** Where to go once it's deleted (for a button on the thing's own page). */
  after?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button" disabled={pending} className="link-btn danger"
      onClick={() => {
        if (!confirm(confirmText)) return;
        start(async () => {
          const r = await action(id);
          if (!r.ok) alert(r.error);
          else if (after) router.push(after);
        });
      }}
    >
      {pending ? "\u2026" : label}
    </button>
  );
}
