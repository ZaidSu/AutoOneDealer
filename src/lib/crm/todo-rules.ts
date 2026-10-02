// The To do list's rules. Pure logic (no imports) so it can be unit tested directly.
export type Reason = "replied" | "callback" | "application" | "new_lead" | "appointment" | "no_show";
export type TodoReason = { reason: Reason; label: string; detail: string; since: number; token: string; weight: number; hot?: boolean };
export type TodoRow = { id: string; customerKey: string | null; name: string | null; phone: string | null; vehicle: string | null; reasons: TodoReason[]; weight: number; since: number };

export const LABEL: Record<Reason, string> = {
  replied: "Customer replied", callback: "Call back", application: "Credit application", new_lead: "New lead, nobody contacted", appointment: "Appointment", no_show: "No-show",
};
/** Lower is more urgent. */
export const WEIGHT = { repliedHot: 0, replied: 1, callback: 1, application: 2, newLead: 2, appointmentToday: 3, noShow: 4, appointmentTomorrow: 5 } as const;

export const stateKey = (id: string, reason: Reason, token: string) => `${id}|${reason}|${token}`;
/** What a saved Done / Snooze key can look like. Keeps junk out of the table. */
export const STATE_KEY = /^[\w:.\-@]{1,120}\|(replied|callback|application|new_lead|appointment|no_show)\|[\w:.\-]{1,60}$/;
export const reasonOfKey = (key: string): Reason | null => (STATE_KEY.test(key) ? (key.split("|")[1] as Reason) : null);

/** Words that mean the customer is ready to move: they jump to the top. */
export function wantsToBuy(text: string): boolean {
  return /\b(deposit|ready to buy|want to buy|i'?ll take it|pay|paying|payment|coming in|come in|stop by|on my way|test drive|financ\w*|trade[- ]?in|still available|is it available)\b/i.test(text);
}

/** "STOP", "HELP", "unsubscribe" and the like are handled automatically, not something to call about. */
export function isKeywordOnly(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout|start|unstop|help|info)\W*$/.test(t)) return true;
  return /^(please\s+)?(unsubscribe|stop|remove me|opt[- ]?out)(\s+(emailing|texting|sending|contacting|messaging)(\s+me)?)?(\s+(from|on)\s+(this|your)\s+list)?\W*$/.test(t);
}

export function ago(ms: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - ms) / 60000));
  if (min < 2) return "just now";
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export const snippet = (text: string, max = 110) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

type Flat = { id: string; customerKey: string | null; name: string | null; phone: string | null; vehicle: string | null; reason: TodoReason };

/** One row per customer, with every reason listed, most urgent first; the longest-waiting first within the same urgency. */
export function mergeRows(flat: Flat[]): TodoRow[] {
  const by = new Map<string, TodoRow>();
  for (const f of flat) {
    const row = by.get(f.id);
    if (!row) by.set(f.id, { id: f.id, customerKey: f.customerKey, name: f.name, phone: f.phone, vehicle: f.vehicle, reasons: [f.reason], weight: f.reason.weight, since: f.reason.since });
    else {
      row.reasons.push(f.reason);
      row.name ??= f.name; row.phone ??= f.phone; row.vehicle ??= f.vehicle;
    }
  }
  const rows = [...by.values()];
  for (const row of rows) {
    row.reasons.sort((a, b) => a.weight - b.weight || a.since - b.since);
    row.weight = row.reasons[0].weight;
    row.since = Math.min(...row.reasons.filter((r) => r.weight === row.weight).map((r) => r.since));
  }
  return rows.sort((a, b) => a.weight - b.weight || a.since - b.since);
}

export const bucket = (weight: number): "now" | "today" | "later" => (weight <= 1 ? "now" : weight <= 3 ? "today" : "later");
