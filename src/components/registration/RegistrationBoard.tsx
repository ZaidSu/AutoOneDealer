"use client";
// The Registration page: every registration sticker with its photo, where it is (not here yet / needs pickup / picked up / done),
// whether a copy was made, and whether the customer has a deferred payment.
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { registrationCopyAction, registrationDeferredAction, registrationDeleteAction, registrationEditAction, registrationStageAction, saveRegistrationSettingsAction, sendRegistrationTestAction } from "@/app/actions";
import { shrink } from "./photo";
import { COPIES, COPY_LABEL, matches, needsCopy, STAGE_LABEL, STAGES, type Filter } from "@/lib/registration/rules";
import type { Reg, RegSettings } from "@/lib/registration/store";

type Msg = { ok: boolean; text: string } | null;
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const prettyPhone = (p: string | null) => (p ? p.replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") : "");

const STAGE_STYLE = {
  waiting: { bar: "#8792ad", on: "bg-[#8792ad] text-white" },
  pickup: { bar: "#f08c00", on: "bg-[#f08c00] text-white" },
  picked: { bar: "#2f6fed", on: "bg-[#2f6fed] text-white" },
  done: { bar: "#12a150", on: "bg-[#12a150] text-white" },
} as const;

export default function RegistrationBoard({ rows, counts, settings }: { rows: Reg[]; counts: { waiting: number; pickup: number; copy: number; deferred: number; open: number }; settings: RegSettings }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Reg | null>(null);
  const [editing, setEditing] = useState<Reg | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return rows.filter((r) => matches(r, filter) && (!needle || `${r.name ?? ""} ${r.vehicle ?? ""} ${r.note}`.toLowerCase().includes(needle) || (digits.length >= 3 && (r.phone ?? "").includes(digits))));
  }, [rows, filter, q]);

  const tiles: { f: Filter; label: string; n: number; color: string; soft: string }[] = [
    { f: "pickup", label: "Needs pickup", n: counts.pickup, color: "#f08c00", soft: "#fff3de" },
    { f: "copy", label: "Needs a copy", n: counts.copy, color: "#2f6fed", soft: "#e8efff" },
    { f: "deferred", label: "Deferred payment", n: counts.deferred, color: "#d7163b", soft: "#fde8ec" },
    { f: "waiting", label: "Not here yet", n: counts.waiting, color: "#6b7794", soft: "#eef1f7" },
  ];
  const chips: [Filter, string][] = [["open", "Open"], ["pickup", "Needs pickup"], ["copy", "Needs copy"], ["deferred", "Deferred"], ["waiting", "Not here yet"], ["done", "Done"], ["all", "All"]];

  return (
    <div>
      <section aria-label="Summary" className="stat-strip mb-6 lg:grid-cols-4" style={{ gridTemplateColumns: undefined }}>
        {tiles.map((t) => (
          <button key={t.f} type="button" onClick={() => setFilter(t.f)} className={`stat text-left ${filter === t.f ? "ring-2" : ""}`} style={filter === t.f ? { ["--tw-ring-color" as string]: t.color } : undefined}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: t.color }} />
            <p className="stat-value" style={{ color: t.n ? t.color : "#b3bacb" }}>{t.n}</p>
            <p className="stat-label">{t.label}</p>
          </button>
        ))}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="segmented">{chips.map(([f, label]) => <button key={f} type="button" aria-current={filter === f ? "page" : undefined} onClick={() => setFilter(f)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f ? "bg-gradient-to-br from-[#2f6fed] to-[#4a52e8] font-semibold text-white" : "text-muted hover:bg-paper"}`}>{label}</button>)}</div>
        <input className="input mt-0 h-10 max-w-[260px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or car" aria-label="Search" />
        <button type="button" className="btn btn-red ml-auto" onClick={() => setAdding(true)}>+ Add registration</button>
      </div>

      {shown.length === 0 ? (
        <p className="panel p-6 text-muted">{rows.length === 0 ? "No registrations yet. Click Add registration and take a photo of the sticker, or they appear here by themselves when a car is marked sold to a customer." : "Nothing matches this filter."}</p>
      ) : (
        <ul className="grid gap-3">{shown.map((r) => <Card key={r.id} r={r} onView={() => setViewing(r)} onEdit={() => setEditing(r)} />)}</ul>
      )}

      <Settings settings={settings} />
      {adding && <AddModal onClose={() => setAdding(false)} />}
      {editing && <EditModal r={editing} onClose={() => setEditing(null)} />}
      {viewing && <Lightbox r={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Card({ r, onView, onEdit }: { r: Reg; onView: () => void; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const x = await fn(); setErr(x.ok ? "" : x.error ?? "Something went wrong."); router.refresh(); });
  const addPhoto = (f: File) => start(async () => {
    try {
      const { photo, thumb } = await shrink(f);
      const form = new FormData(); form.set("photo", photo, "sticker.jpg"); form.set("thumb", thumb, "thumb.jpg");
      const res = await fetch(`/api/registration/${r.id}/photo`, { method: "POST", body: form });
      setErr(res.ok ? "" : ((await res.json().catch(() => ({}))).error ?? "Couldn't save the photo."));
    } catch { setErr("Couldn't read that photo."); }
    router.refresh();
  });
  const st = STAGE_STYLE[r.stage];
  return (
    <li className={`panel relative overflow-hidden ${r.stage === "done" ? "opacity-80" : ""}`}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: st.bar }} />
      <div className="flex flex-wrap items-start gap-4 p-4 pl-5">
        <button type="button" onClick={r.hasPhoto ? onView : () => file.current?.click()} className="grid size-[84px] shrink-0 place-items-center overflow-hidden rounded-xl bg-paper text-center text-xs font-semibold text-muted ring-1 ring-line hover:ring-azure" aria-label={r.hasPhoto ? "View photo" : "Add photo"}>
          {r.hasPhoto
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/registration/${r.id}/photo?thumb=1`} alt="Registration sticker" loading="lazy" className="size-full object-cover" />
            : <span>+ Photo</span>}
        </button>
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ""; }} />

        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold">{r.name || "No name"}</h3>
            {r.deferred && <span className="rounded-full bg-signal px-2.5 py-0.5 text-xs font-bold text-white">Deferred payment</span>}
            {needsCopy(r) && r.stage !== "done" && <span className="rounded-full bg-azure-soft px-2.5 py-0.5 text-xs font-bold text-[#1f4fb8]">Copy needed</span>}
            {r.stage === "waiting" && r.reminders > 0 && <span className="rounded-full bg-sun-soft px-2.5 py-0.5 text-xs font-bold text-[#8a5300]">Manager texted</span>}
          </div>
          <p className="mt-0.5 text-[15px] text-muted">
            {r.vehicle || "Car not entered"}
            {r.phone && <> · <a href={`tel:${r.phone}`} className="font-semibold text-ink hover:underline">{prettyPhone(r.phone)}</a></>}
          </p>
          <p className="mt-0.5 text-sm text-faint">
            {r.purchasedAt ? `Bought ${day(r.purchasedAt)}` : `Added ${day(r.createdAt)}`}{r.createdBy ? ` · ${r.createdBy}` : ""}
            {r.note && <> · <span className="text-muted">{r.note}</span></>}
          </p>
          {r.customerKey && <a href={`/customers/${encodeURIComponent(r.customerKey)}`} className="mt-1 inline-block text-sm font-semibold text-azure hover:underline">Open customer →</a>}
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[330px]">
          <div role="group" aria-label="Where it is" className="grid grid-cols-4 gap-1 rounded-xl bg-paper p-1">
            {STAGES.map((s) => (
              <button key={s} type="button" disabled={pending} onClick={() => r.stage !== s && run(() => registrationStageAction(r.id, s))}
                className={`rounded-lg px-1 py-1.5 text-xs font-semibold leading-tight transition-colors ${r.stage === s ? STAGE_STYLE[s].on : "text-muted hover:bg-white"}`}>{STAGE_LABEL[s]}</button>
            ))}
          </div>
          <div role="group" aria-label="Copy" className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
            {COPIES.map((c) => (
              <button key={c} type="button" disabled={pending} onClick={() => r.copy !== c && run(() => registrationCopyAction(r.id, c))}
                className={`rounded-lg px-1 py-1.5 text-xs font-semibold transition-colors ${r.copy === c ? (c === "made" ? "bg-[#12a150] text-white" : c === "needed" ? "bg-[#2f6fed] text-white" : "bg-[#8792ad] text-white") : "text-muted hover:bg-white"}`}>{COPY_LABEL[c]}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => registrationDeferredAction(r.id, !r.deferred))} className={`btn btn-sm ${r.deferred ? "!bg-signal-soft !text-signal-dark" : ""}`}>{r.deferred ? "✓ Deferred payment" : "Deferred payment?"}</button>
            <button type="button" className="btn btn-sm" onClick={onEdit}>Edit</button>
            {r.hasPhoto && <a className="btn btn-sm" href={`/api/registration/${r.id}/photo?download=1`}>Download</a>}
            <button type="button" className="btn btn-sm ml-auto text-signal" disabled={pending} onClick={() => window.confirm("Delete this registration entry and its photo?") && run(() => registrationDeleteAction(r.id))}>Delete</button>
          </div>
        </div>
      </div>
      {err && <p role="alert" className="px-5 pb-3 text-sm text-signal">{err}</p>}
      {r.history.length > 0 && (
        <details className="border-t border-line px-5 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">History</summary>
          <ul className="mt-2 grid gap-1 pb-1 text-muted">{[...r.history].reverse().map((h, i) => <li key={i}><span className="text-faint">{when(h.at)}</span> · {h.by}: {h.text}</li>)}</ul>
        </details>
      )}
    </li>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#0b1020]/55 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="section-title">{title}</h2><button type="button" className="btn btn-sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function AddModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", phone: "", vehicle: "", note: "", deferred: false });
  const [pic, setPic] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const save = () => start(async () => {
    try {
      const form = new FormData();
      for (const [k, v] of Object.entries(f)) form.set(k, typeof v === "boolean" ? (v ? "1" : "0") : v);
      if (pic) { const { photo, thumb } = await shrink(pic); form.set("photo", photo, "sticker.jpg"); form.set("thumb", thumb, "thumb.jpg"); }
      const res = await fetch("/api/registration", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.error ?? "Couldn't save it."); return; }
      router.refresh(); onClose();
    } catch { setErr("Couldn't read that photo. Try taking it again."); }
  });
  return (
    <Modal title="Add a registration" onClose={onClose}>
      <button type="button" onClick={() => input.current?.click()} className="mb-3 grid h-40 w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-paper text-center font-semibold text-muted hover:border-azure">
        {preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={preview} alt="Chosen photo" className="size-full object-contain" />
          : <span>📷 Take or choose a photo of the sticker</span>}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const p = e.target.files?.[0]; if (p) { setPic(p); setPreview(URL.createObjectURL(p)); } }} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Name<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="From the sticker" /></label>
        <label className="field">Phone<input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(214) 555-0123" /></label>
        <label className="field sm:col-span-2">Car<input className="input" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} placeholder="2019 Toyota Camry" /></label>
        <label className="field sm:col-span-2">Note (optional)<input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 font-medium"><input type="checkbox" className="size-4 accent-signal" checked={f.deferred} onChange={(e) => setF({ ...f, deferred: e.target.checked })} /> Deferred payment</label>
      <p className="mt-2 text-sm text-muted">A phone number we already know connects this to that customer.</p>
      {err && <p role="alert" className="mt-2 text-sm text-signal">{err}</p>}
      <div className="mt-4 flex gap-2"><button type="button" className="btn btn-red" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

function EditModal({ r, onClose }: { r: Reg; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: r.name ?? "", phone: r.phone ?? "", vehicle: r.vehicle ?? "", note: r.note });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal title="Edit details" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Name<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">Phone<input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="field sm:col-span-2">Car<input className="input" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} /></label>
        <label className="field sm:col-span-2">Note<input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-signal">{err}</p>}
      <div className="mt-4 flex gap-2"><button type="button" className="btn btn-red" disabled={pending} onClick={() => start(async () => { const x = await registrationEditAction(r.id, f); if (x.ok) { router.refresh(); onClose(); } else setErr(x.error); })}>{pending ? "Saving…" : "Save"}</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

function Lightbox({ r, onClose }: { r: Reg; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b1020]/80 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/registration/${r.id}/photo`} alt={`Registration for ${r.name ?? "customer"}`} className="max-h-[78vh] w-full rounded-xl bg-white object-contain" />
        <div className="mt-3 flex items-center justify-between text-white"><span className="font-semibold">{r.name} {r.vehicle ? `· ${r.vehicle}` : ""}</span>
          <span className="flex gap-2"><a className="btn btn-sm" href={`/api/registration/${r.id}/photo?download=1`}>Download</a><button type="button" className="btn btn-sm" onClick={onClose}>Close</button></span></div>
      </div>
    </div>
  );
}

function Settings({ settings }: { settings: RegSettings }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <section className="panel mt-8 p-5" aria-labelledby="reg-settings">
      <h2 id="reg-settings" className="text-[17px] font-bold">Reminder text to the manager</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">After a car is sold, AutoDash texts this ONE number (not email) a few weeks later asking if the registration came in, with a link to this page to add it. If it still isn&apos;t here a week later, it asks once more.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,260px)_140px_auto] sm:items-end">
        <label className="field">Manager phone<input className="input" inputMode="tel" value={s.phone} onChange={(e) => { setS({ ...s, phone: e.target.value }); setMsg(null); }} placeholder="(214) 555-0123" /></label>
        <label className="field">Weeks after sale<select className="input" value={s.weeks} onChange={(e) => { setS({ ...s, weeks: Number(e.target.value) }); setMsg(null); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} week{n === 1 ? "" : "s"}</option>)}</select></label>
        <label className="flex h-[2.7rem] items-center gap-2 font-medium"><input type="checkbox" className="size-4 accent-signal" checked={s.on} onChange={(e) => { setS({ ...s, on: e.target.checked }); setMsg(null); }} /> Reminders on</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const x = await saveRegistrationSettingsAction(s); setMsg(x.ok ? { ok: true, text: "Saved." } : { ok: false, text: x.error }); router.refresh(); })}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { const x = await sendRegistrationTestAction(); setMsg({ ok: x.ok, text: x.ok ? x.message ?? "Sent." : x.error }); })}>Send a test text</button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-go" : "text-signal"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
