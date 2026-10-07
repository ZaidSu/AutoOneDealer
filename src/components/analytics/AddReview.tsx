"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addReviewAction, removeReviewAction, setGoogleProfileAction } from "@/app/actions";

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

/** Google doesn't email about every review, so the totals can be set to what Google's own page shows. */
export function GoogleNumbers({ total, rating }: { total: number | null; rating: number | null }) {
  const [t, setT] = useState(total === null ? "" : String(total));
  const [r, setR] = useState(rating === null ? "" : String(rating));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
      <p className="basis-full text-sm font-semibold">Google&apos;s own numbers <span className="font-normal text-muted">(search your business on Google and type what it shows, so the totals match)</span></p>
      <label className="field w-32">Reviews<input className="input" inputMode="numeric" placeholder="13" value={t} onChange={(e) => { setT(e.target.value); setMsg(null); }} /></label>
      <label className="field w-32">Stars (like 4.8)<input className="input" inputMode="decimal" placeholder="5.0" value={r} onChange={(e) => { setR(e.target.value); setMsg(null); }} /></label>
      <button type="button" className="btn" disabled={pending || !t} onClick={() => start(async () => {
        const res = await setGoogleProfileAction(Number(t), r === "" ? null : Number(r));
        setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error }); if (res.ok) router.refresh();
      })}>{pending ? "Saving…" : "Save"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
    </div>
  );
}
