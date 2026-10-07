"use client";
// "Remove customer" on a customer's profile. Asks first; for someone marked as purchased it warns that the sale leaves the numbers.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeCustomerAction } from "@/app/actions";
import { notifyChanged } from "@/lib/client/live";

export default function RemoveCustomerButton({ customerKey, name, purchased }: { customerKey: string; name: string | null; purchased: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const who = name?.trim() || "this customer";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => {
          const warning = purchased ? `\n\n${who} is marked as having bought a car. Removing them also takes that sale out of your numbers.` : "";
          if (!window.confirm(`Remove ${who} from AutoDash?\n\nTheir profile, notes, history and lead emails are hidden from every page, and any AI replies waiting for approval are discarded. This can't be undone from here.${warning}`)) return;
          setError(null);
          start(async () => {
            const result = await removeCustomerAction(customerKey);
            if (!result.ok) { setError(result.error); return; }
            notifyChanged();
            router.push("/customers");
            router.refresh();
          });
        }}
      >
        {pending ? "Removing…" : "Remove customer"}
      </button>
      {error && <span role="alert" className="text-sm text-signal">{error}</span>}
    </span>
  );
}
