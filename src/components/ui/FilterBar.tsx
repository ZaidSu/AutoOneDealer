"use client";
// Dropdowns that put their choice in the page address (?year=2026), so the page reloads with that filter.
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Field = { name: string; label: string; value: string; options: { value: string; label: string }[] };

export default function FilterBar({ fields }: { fields: Field[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function change(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(name, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <>
      {fields.map((f) => (
        <select key={f.name} aria-label={f.label} value={f.value} onChange={(e) => change(f.name, e.target.value)} className="input !h-10 !w-auto min-w-[120px]">
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </>
  );
}
