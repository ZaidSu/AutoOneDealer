"use client";
import { useState, useTransition } from "react";
import { setAppointmentStatusAction } from "@/app/actions";
import type { AppointmentStatus } from "@/lib/db/data";

const choices: { value: AppointmentStatus; label: string }[] = [
  { value: "showed", label: "Showed up" },
  { value: "no_show", label: "No-show" },
  { value: "canceled", label: "Canceled" },
];

export default function StatusButtons({ id, status }: { id: number; status: AppointmentStatus }) {
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set(next: AppointmentStatus) {
    const previous = current;
    setCurrent(next);
    start(async () => {
      const r = await setAppointmentStatusAction(id, next);
      if (!r.ok) { setCurrent(previous); setError(r.error); }
    });
  }

  if (current !== "scheduled") {
    const label = choices.find((c) => c.value === current)?.label;
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className={current === "showed" ? "font-semibold text-go" : current === "no_show" ? "font-semibold text-signal" : "text-muted"}>{label}</span>
        <button type="button" disabled={pending} onClick={() => set("scheduled")} className="text-muted underline hover:text-ink">Undo</button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {choices.map((c) => (
        <button key={c.value} type="button" disabled={pending} onClick={() => set(c.value)}
          className="h-8 rounded-md px-2.5 text-sm font-medium ring-1 ring-line hover:bg-paper disabled:opacity-60">{c.label}</button>
      ))}
      {error && <span role="alert" className="text-sm text-signal">{error}</span>}
    </span>
  );
}
