import { dealership } from "@/lib/dealership";

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: dealership.timeZone,
});
const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: dealership.timeZone });

export function formatDateTime(ms: number): string {
  if (!ms) return "Unknown time";
  return dateTimeFmt.format(new Date(ms));
}

export function formatPhone(phone: string | null): string {
  if (!phone || phone.length !== 10) return phone ?? "";
  return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
}

export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return moneyFmt.format(value);
}

/** "JOHN SAMPLE" → "John Sample"; leaves normally-cased names alone. */
export function displayName(name: string | null): string {
  if (!name) return "Name not provided";
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function isSameDealershipDay(ms: number, now = Date.now()): boolean {
  const day = (t: number) => dayFmt.format(new Date(t));
  return day(ms) === day(now);
}
