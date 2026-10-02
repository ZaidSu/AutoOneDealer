"use client";
import Link from "next/link";
import { useState } from "react";

/** The public sign-up for text updates. The checkbox starts unchecked and the wording sits right next to it. */
export default function TextSignupForm({ consentText, phone }: { consentText: string; phone: string }) {
  const [form, setForm] = useState({ name: "", phone: "", vehicle: "", agree: false, website: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const set = (k: "name" | "phone" | "vehicle" | "website") => (e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [k]: e.target.value }); setError(""); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setError("");
    try {
      const res = await fetch("/api/sms/optin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => null);
      if (data?.ok) setState("done");
      else { setError(data?.message ?? "Something went wrong. Please try again."); setState("idle"); }
    } catch { setError("Couldn't reach the server. Please try again."); setState("idle"); }
  }

  if (state === "done") {
    return (
      <div role="status" className="mt-6 rounded-xl border border-go/30 bg-go-soft p-5">
        <p className="text-lg font-semibold text-go">You&apos;re signed up.</p>
        <p className="mt-1">We&apos;ll text you about your vehicle inquiry. Reply <b>STOP</b> to any text to cancel, or <b>HELP</b> for help. You can also call us at {phone}.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 grid gap-4 rounded-xl border border-line bg-white p-5">
      <label className="grid gap-1 text-[15px] font-semibold">Your name
        <input className="h-11 rounded-md border border-line px-3 text-[16px] font-normal" autoComplete="name" required maxLength={60} value={form.name} onChange={set("name")} />
      </label>
      <label className="grid gap-1 text-[15px] font-semibold">Mobile number
        <input className="h-11 rounded-md border border-line px-3 text-[16px] font-normal" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(469) 555-0123" value={form.phone} onChange={set("phone")} />
      </label>
      <label className="grid gap-1 text-[15px] font-semibold">Car you&apos;re interested in <span className="font-normal text-muted">(optional)</span>
        <input className="h-11 rounded-md border border-line px-3 text-[16px] font-normal" maxLength={80} placeholder="2019 Toyota Camry" value={form.vehicle} onChange={set("vehicle")} />
      </label>
      {/* A hidden field for bots. People never see or fill it in. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" value={form.website} onChange={set("website")} />
      <label className="flex items-start gap-3 text-[15px] leading-snug">
        <input type="checkbox" className="mt-1 size-5 shrink-0" checked={form.agree} onChange={(e) => { setForm({ ...form, agree: e.target.checked }); setError(""); }} />
        <span>{consentText} See our <Link href="/privacy" className="font-semibold text-signal underline">Privacy Policy</Link> and <Link href="/sms-terms" className="font-semibold text-signal underline">Text Message Terms</Link>.</span>
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-signal">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="h-12 rounded-lg bg-signal px-6 text-[16px] font-semibold text-white hover:bg-signal-dark disabled:opacity-60">
        {state === "sending" ? "Signing you up…" : "Sign up for text updates"}
      </button>
    </form>
  );
}
