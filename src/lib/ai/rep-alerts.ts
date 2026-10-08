// A short history of the texts AutoDash sent (or tried to send) to the dealership phone, so staff can see them on the
// Dealership info page. Kept in app_settings; the newest 30 stay.
import { getSetting, setSetting } from "@/lib/db/data";

export type RepAlert = {
  at: number; kind: "alert" | "test"; customer: string | null; customerKey: string | null; to: string | null;
  ok: boolean; sid: string | null; status: string | null; error: string | null; body: string;
};
const KEY = "rep_alert_log";

export async function getRepAlerts(): Promise<RepAlert[]> {
  try { const raw = await getSetting(KEY); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list : []; } catch { return []; }
}
export async function logRepAlert(entry: Omit<RepAlert, "at">) {
  try {
    const list = await getRepAlerts();
    await setSetting(KEY, JSON.stringify([{ at: Date.now(), ...entry, body: entry.body.slice(0, 400) }, ...list].slice(0, 30)));
  } catch { /* the history is only for looking at */ }
}
