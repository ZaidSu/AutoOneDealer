// Records that the dealership owner accepted the AutoDash Service Agreement (who, when, which version).
// A page on a website doesn't bind anyone until they agree to it, so this is the proof that they did.
import { getSetting, setSetting } from "@/lib/db/data";
import { LEGAL } from "./config";

export type Acceptance = { version: string; by: string; email: string; at: number };

export async function getAcceptance(): Promise<Acceptance | null> {
  try { const raw = await getSetting("agreement_accepted"); return raw ? (JSON.parse(raw) as Acceptance) : null; } catch { return null; }
}

/** True once the current version of the agreement has been accepted. */
export const isCurrent = (a: Acceptance | null) => Boolean(a && a.version === LEGAL.agreementVersion);

export async function recordAcceptance(by: string, email: string): Promise<Acceptance> {
  const value: Acceptance = { version: LEGAL.agreementVersion, by, email, at: Date.now() };
  await setSetting("agreement_accepted", JSON.stringify(value));
  // Keep every acceptance, not just the latest, in case the agreement changes later.
  const history = await getSetting("agreement_history").catch(() => null);
  let list: Acceptance[] = [];
  try { list = history ? JSON.parse(history) : []; } catch { /* start a new list */ }
  await setSetting("agreement_history", JSON.stringify([...list, value].slice(-20)));
  return value;
}
