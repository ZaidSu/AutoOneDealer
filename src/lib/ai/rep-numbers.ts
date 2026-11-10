// The phone numbers that get a text when a customer asks for a sales rep: up to 3. Pure, so it can be tested.
// The first one falls back to the dealership phone when left blank.
import type { DealershipInfo } from "./types.ts";

export const MAX_REP_NUMBERS = 3;

/** A US phone number as 10 digits, or null if it isn't one. */
export function ten(value: string | null | undefined): string | null {
  const d = String(value ?? "").replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? n : null;
}

/** The alert numbers in order, valid and without repeats. `exclude` removes numbers that can't be used (the AutoDash texting number). */
export function repAlertNumbers(info: Pick<DealershipInfo, "phone" | "repAlertPhone" | "repAlertPhone2" | "repAlertPhone3">, exclude: string[] = []): string[] {
  const skip = new Set(exclude.map(ten).filter(Boolean) as string[]);
  const raw = [(info.repAlertPhone ?? "").trim() || info.phone, info.repAlertPhone2 ?? "", info.repAlertPhone3 ?? ""];
  const out: string[] = [];
  for (const r of raw) {
    const n = ten(r);
    if (n && !skip.has(n) && !out.includes(n)) out.push(n);
  }
  return out.slice(0, MAX_REP_NUMBERS);
}
