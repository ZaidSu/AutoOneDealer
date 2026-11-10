"use client";
import { useState, useTransition } from "react";
import { saveDealershipInfoAction, sendRepAlertTestAction } from "@/app/actions";
import ReadOnlyNotice from "@/components/ai/ReadOnlyNotice";
import { repAlertNumbers } from "@/lib/ai/rep-numbers";
import { DAYS, type DealershipInfo } from "@/lib/ai/types";

export default function DealershipInfoForm({ initial, canEdit }: { initial: DealershipInfo; canEdit: boolean }) {
  const [info, setInfo] = useState(initial);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, startTest] = useTransition();
  const set = (k: "address" | "phone" | "repAlertPhone" | "website" | "links" | "notes") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInfo({ ...info, [k]: e.target.value }); setResult(null);
  };
  const setHours = (i: number, patch: Partial<DealershipInfo["hours"][number]>) => {
    setInfo({ ...info, hours: info.hours.map((h, j) => (j === i ? { ...h, ...patch } : h)) }); setResult(null);
  };
  const save = () => start(async () => {
    const r = await saveDealershipInfoAction(info);
    setResult(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
  });

  return (
    <div className="grid gap-6">
      {!canEdit && <ReadOnlyNotice />}
      <section className="panel p-5">
        <h2 className="text-[17px] font-semibold">Contact</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">Address<input className="input" disabled={!canEdit} value={info.address} onChange={set("address")} placeholder="1234 Main St, Dallas, TX 75001" /></label>
          <label className="field">Phone<input className="input" disabled={!canEdit} value={info.phone} onChange={set("phone")} inputMode="tel" placeholder="(214) 555-0123" /></label>
          <label className="field">Website<input className="input" disabled={!canEdit} value={info.website} onChange={set("website")} placeholder="https://…" /></label>
          <div className="field sm:col-span-2">
            <span>Text a sales rep alert to</span>
            <p className="mt-1 text-sm text-muted">
              When a customer tells the AI they want a sales rep, AutoDash texts these numbers (up to 3 people) with the customer&apos;s name, phone and car. Leave the first blank to use the Phone above.
              Change a number here whenever it changes, then Save. Each one has to be different from the AutoDash texting number.
            </p>
            <div className="mt-2 grid gap-3">
              {(["repAlertPhone", "repAlertPhone2", "repAlertPhone3"] as const).map((k, i) => {
                const value = (info[k] ?? "").trim() || (i === 0 ? info.phone.trim() : "");
                return (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-azure-soft text-sm font-bold text-azure">{i + 1}</span>
                    <input className="input mt-0 min-w-[200px] flex-1" aria-label={`Alert number ${i + 1}`} disabled={!canEdit} value={info[k] ?? ""} onChange={(e) => { setInfo({ ...info, [k]: e.target.value }); setResult(null); }}
                      inputMode="tel" placeholder={i === 0 ? info.phone || "(214) 555-0123" : "Optional: another person's number"} />
                    {canEdit && value && (
                      <button type="button" className="btn btn-sm" disabled={testing} onClick={() => startTest(async () => {
                        const r = await sendRepAlertTestAction(value);
                        setTest({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
                      })}>{testing ? "Sending…" : "Send a test"}</button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted">
              Right now it texts <span className="font-semibold text-ink">{repAlertNumbers(info).join(", ") || "no number yet"}</span>.
            </p>
            {test && <p role="status" className={`mt-1 text-sm ${test.ok ? "text-go" : "text-signal"}`}>{test.text}</p>}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-[17px] font-semibold">Opening hours</h2>
        <ul className="mt-2 divide-y divide-line">
          {DAYS.map((day, i) => {
            const h = info.hours[i];
            return (
              <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <span className="w-28 font-medium">{day}</span>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" disabled={!canEdit} checked={h.closed} onChange={(e) => setHours(i, { closed: e.target.checked })} className="size-4 accent-signal" />
                  Closed
                </label>
                {!h.closed && (
                  <span className="flex items-center gap-2">
                    <input type="time" aria-label={`${day} opens`} disabled={!canEdit} value={h.open} onChange={(e) => setHours(i, { open: e.target.value })} className="input mt-0 h-9 w-32" />
                    <span className="text-muted">to</span>
                    <input type="time" aria-label={`${day} closes`} disabled={!canEdit} value={h.close} onChange={(e) => setHours(i, { close: e.target.value })} className="input mt-0 h-9 w-32" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="text-[17px] font-semibold">Helpful links and details</h2>
        <div className="mt-3 grid gap-4">
          <label className="field">Important links, one per line
            <textarea className="input" rows={4} disabled={!canEdit} value={info.links} onChange={set("links")}
              placeholder={"Credit application: https://…\nInventory: https://…\nGoogle reviews: https://…"} />
          </label>
          <label className="field">Anything else customers often ask about
            <textarea className="input" rows={4} disabled={!canEdit} value={info.notes} onChange={set("notes")}
              placeholder="Trade-ins welcome. Se habla español. Bring a driver's license for test drives." />
          </label>
        </div>
      </section>

      {canEdit ? (
        <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-line bg-paper/95 px-1 py-3 backdrop-blur">
          <button type="button" disabled={pending} onClick={save} className="btn btn-red">{pending ? "Saving…" : "Save dealership info"}</button>
          {result && <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-go" : "text-signal"}`}>{result.text}</p>}
        </div>
      ) : (
        null
      )}
    </div>
  );
}
