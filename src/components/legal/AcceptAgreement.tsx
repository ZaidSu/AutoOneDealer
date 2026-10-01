"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptAgreementAction } from "@/app/actions";

/** Banner on the Billing page until the dealership owner accepts the Service Agreement. */
export default function AcceptAgreement({ canAccept }: { canAccept: boolean }) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const accept = () => start(async () => {
    const r = await acceptAgreementAction();
    if (!r.ok) return setError(r.error);
    router.refresh();
  });
  return (
    <div role="region" aria-label="Service Agreement" className="mb-6 rounded-xl border border-lane/40 bg-[#fdf6e3] px-5 py-4">
      <p className="text-[17px] font-semibold">Please review and accept the AutoDash Service Agreement</p>
      <p className="mt-1 text-[15px]">It covers billing, how the AI is used, and who is responsible for what. <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-signal hover:underline">Read the agreement</a>.</p>
      {canAccept ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[15px]">
            <input type="checkbox" checked={checked} onChange={(e) => { setChecked(e.target.checked); setError(""); }} />
            I have read the agreement and I&apos;m authorized to accept it for the dealership.
          </label>
          <button type="button" className="btn btn-red" disabled={!checked || pending} onClick={accept}>{pending ? "Saving…" : "I accept"}</button>
          {error && <p role="alert" className="text-sm text-signal">{error}</p>}
        </div>
      ) : <p className="mt-2 text-sm text-muted">The dealership owner needs to sign in with their own account and accept it here.</p>}
    </div>
  );
}
