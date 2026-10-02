"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addReviewAction, removeReviewAction } from "@/app/actions";

const SOURCES = ["Google", "Facebook", "Cars.com", "DealerRater", "CarsForSale", "Yelp", "Other"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** For reviews on sites AutoDash can't see (Cars.com, Facebook...), or older Google reviews. */
export function AddReview() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ source: "Google", reviewer: "", rating: 5, text: "", date: today() });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Add a review</button>;
  return (
    <div className="panel w-full p-4">
      <p className="font-semibold">Add a review</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="field w-40">Where<select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field w-48">Name<input className="input" value={form.reviewer} onChange={(e) => setForm({ ...form, reviewer: e.target.value })} /></label>
        <label className="field w-32">Stars<select className="input" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {"★".repeat(n)}</option>)}</select></label>
        <label className="field w-44">Date<input type="date" className="input" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      </div>
      <label className="field mt-3">What they said (optional)<input className="input" maxLength={1000} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-red" disabled={pending} onClick={() => start(async () => {
          const r = await addReviewAction(form);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: "Added." }); setForm({ ...form, reviewer: "", text: "" }); router.refresh();
        })}>{pending ? "Adding…" : "Add"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

/** Takes a review out of the numbers (a duplicate, or one Google removed). */
export function RemoveReview({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="text-sm text-muted underline hover:text-ink" disabled={pending} onClick={() => {
    if (!window.confirm("Take this review out of the numbers?")) return;
    start(async () => { await removeReviewAction(id); router.refresh(); });
  }}>{pending ? "…" : "Remove"}</button>;
}
