// The "what happened since the last update" email AutoDash sends to the dealership inbox. Pure formatting, no project imports
// (unit tested directly). The subject deliberately never contains the words "lead" or "loan app", so AutoDash's own lead
// import can't mistake this email for a customer.
export type DigestPerson = {
  name: string | null; phone: string | null; email: string | null; vehicle: string | null; provider: string | null;
  /** What they said, if anything. */
  message: string | null;
  /** True if someone at the dealership already contacted them (marked on their profile). */
  contacted: boolean;
  /** What the AI did with their first message: sent a reply, wrote a draft, or nothing. */
  ai: "sent" | "draft" | "none";
  aiSentAt: number | null;
  at: number;
};
export type DigestData = {
  dealership: string; timeZone: string; from: number; to: number; appUrl: string | null;
  newPeople: DigestPerson[];
  /** Customers who wrote back by email or text. */
  wroteBack: { name: string | null; via: "email" | "text"; phone: string | null; email: string | null; text: string; at: number }[];
  aiSent: { name: string | null; email: string; vehicle: string | null; at: number; auto: boolean }[];
  draftsWaiting: number;
  appointments: { name: string; phone: string | null; vehicle: string | null; at: number }[];
  newCars: string[];
  soldCars: string[];
};

const when = (ms: number, tz: string, withDay = false) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, ...(withDay ? { month: "short", day: "numeric" } : {}), hour: "numeric", minute: "2-digit" }).format(new Date(ms));
export const prettyPhone = (p: string | null) => {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? "";
};
const clip = (t: string, n: number) => { const s = t.replace(/\s+/g, " ").trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const isOfferUp = (p: { provider: string | null; email: string | null }) => /offerup/i.test(p.provider ?? "") || /@messages\.offerup\.com$/i.test(p.email ?? "");
const contactLine = (p: { name: string | null; phone: string | null; email: string | null; provider: string | null }) => {
  const how = isOfferUp(p) ? "no phone: answer in the OfferUp app" : [p.phone ? prettyPhone(p.phone) : null, p.email && !isOfferUp(p) ? p.email : null].filter(Boolean).join(", ") || "no phone or email given";
  return `${p.name?.trim() || "Name not given"} (${how})`;
};

/** Everyone who still needs a person: new customers nobody has contacted yet, and anyone who wrote back. */
export function peopleToContact(d: DigestData) {
  return d.newPeople.filter((p) => !p.contacted);
}

export function digestIsEmpty(d: DigestData): boolean {
  return d.newPeople.length === 0 && d.wroteBack.length === 0 && d.aiSent.length === 0 && d.draftsWaiting === 0;
}

export function digestSubject(d: DigestData): string {
  const need = peopleToContact(d).length + d.wroteBack.length;
  const bits = [
    d.newPeople.length ? `${d.newPeople.length} new customer${d.newPeople.length === 1 ? "" : "s"}` : null,
    d.wroteBack.length ? `${d.wroteBack.length} wrote back` : null,
    need ? `${need} to contact` : null,
  ].filter(Boolean);
  return `AutoDash update, ${when(d.to, d.timeZone)}${bits.length ? `: ${bits.join(", ")}` : ": nothing new"}`;
}

export function digestBody(d: DigestData): string {
  const tz = d.timeZone;
  const span = d.to - d.from > 20 * 3600_000 ? "since yesterday" : `${when(d.from, tz, new Date(d.from).toDateString() !== new Date(d.to).toDateString())} to ${when(d.to, tz)}`;
  const out: string[] = [`${d.dealership} update (${span}, Dallas time)`, ""];
  if (digestIsEmpty(d)) { out.push("Nothing new in this period."); }

  const todo = peopleToContact(d);
  if (todo.length || d.wroteBack.length) {
    out.push(`PLEASE CONTACT THESE PEOPLE (${todo.length + d.wroteBack.length})`);
    let n = 1;
    for (const p of todo) {
      out.push(`${n++}. ${contactLine(p)}`);
      out.push(`   ${p.provider ?? "A listing site"}${p.vehicle ? `, asked about the ${p.vehicle}` : ""}, at ${when(p.at, tz)}`);
      if (p.message) out.push(`   They said: "${clip(p.message, 220)}"`);
      out.push(`   AI: ${p.ai === "sent" ? `already emailed them${p.aiSentAt ? ` at ${when(p.aiSentAt, tz)}` : ""}` : p.ai === "draft" ? "reply written, waiting for you to approve it" : "has not contacted them"}`);
    }
    for (const w of d.wroteBack) {
      out.push(`${n++}. ${contactLine({ ...w, provider: null })} wrote back by ${w.via} at ${when(w.at, tz)}`);
      out.push(`   They said: "${clip(w.text, 220)}"`);
    }
    out.push("");
  }
  const handled = d.newPeople.filter((p) => p.contacted);
  if (handled.length) {
    out.push(`ALREADY CONTACTED (${handled.length})`);
    for (const p of handled) out.push(`- ${contactLine(p)}${p.vehicle ? `, ${p.vehicle}` : ""}`);
    out.push("");
  }
  if (d.aiSent.length) {
    out.push(`WHAT THE AI EMAILED (${d.aiSent.length})`);
    for (const s of d.aiSent) out.push(`- ${when(s.at, tz)}: ${s.name?.trim() || s.email}${s.vehicle ? ` about the ${s.vehicle}` : ""}${s.auto ? " (sent automatically)" : " (approved by staff)"}`);
    out.push("");
  }
  if (d.draftsWaiting) {
    out.push(`WAITING FOR YOU: ${d.draftsWaiting} AI repl${d.draftsWaiting === 1 ? "y is" : "ies are"} written and need${d.draftsWaiting === 1 ? "s" : ""} your OK before sending.${d.appUrl ? ` ${d.appUrl}/ai/emails` : ""}`, "");
  }
  if (d.appointments.length) {
    out.push("APPOINTMENTS IN THE NEXT 24 HOURS");
    for (const a of d.appointments) out.push(`- ${when(a.at, tz, true)}: ${a.name}${a.phone ? ` ${prettyPhone(a.phone)}` : ""}${a.vehicle ? `, ${a.vehicle}` : ""}`);
    out.push("");
  }
  if (d.newCars.length || d.soldCars.length) {
    out.push("INVENTORY");
    for (const c of d.newCars) out.push(`- New on the website: ${c}`);
    for (const c of d.soldCars) out.push(`- Sold / gone from the website: ${c}`);
    out.push("");
  }
  if (d.appUrl) out.push(`Open AutoDash: ${d.appUrl}`);
  out.push("(Sent automatically by AutoDash. You can change how often under AI > Automations.)");
  return out.join("\n");
}
