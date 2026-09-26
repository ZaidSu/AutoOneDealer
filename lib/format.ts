import { dealership } from "@/lib/dealership";

export function formatDateTime(ms: number): string {
  if (!ms) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: dealership.timeZone,
  }).format(new Date(ms));
}

export function formatPhone(phone: string | null): string {
  if (!phone || phone.length !== 10) return phone ?? "";
  return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** "JOHN SAMPLE" → "John Sample"; leaves normally-cased names alone. */
export function displayName(name: string | null): string {
  if (!name) return "Name not provided";
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function isSameDealershipDay(ms: number, now = Date.now()): boolean {
  const day = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: dealership.timeZone }).format(new Date(t));
  return day(ms) === day(now);
}
