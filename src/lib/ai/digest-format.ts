// The "customers waiting" email AutoDash sends to the dealership inbox every so often. Pure formatting, no project imports
// (unit tested directly). The subject deliberately never contains the words "lead" or "loan app", so AutoDash's own lead
// import can't mistake this email for a customer.
export type WaitingCustomer = {
  name: string | null; phone: string | null; email: string | null; vehicle: string | null; provider: string | null;
  /** What they asked for / said when they first reached out. */
  message: string | null;
  /** Where to talk to them in AutoDash (their profile page), when the address of the app is known. */
  link: string | null;
  /** What the AI did with their first message: sent a reply, wrote a draft, or nothing. */
  ai: "sent" | "draft" | "none";
  aiSentAt: number | null;
  /** The reply the AI sent or drafted. */
  aiText: string | null;
  /** Anything they wrote back since (by email or text), oldest first. */
  replies: { via: "email" | "text"; text: string; at: number }[];
  at: number;
};
export type DigestData = {
  dealership: string; timeZone: string; from: number; to: number; appUrl: string | null;
  /** Everyone nobody at the dealership has contacted yet, oldest first. */
  waiting: WaitingCustomer[];
  /** Optional extras, off unless turned on under AI > Automations. */
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

export const peopleToContact = (d: DigestData) => d.waiting;

/** Nothing is sent when nobody is waiting (and no optional extra applies). */
export function digestIsEmpty(d: DigestData): boolean {
  return d.waiting.length === 0 && d.draftsWaiting === 0;
}

export function digestSubject(d: DigestData): string {
  const n = d.waiting.length;
  const wrote = d.waiting.filter((p) => p.replies.length).length;
  if (!n) return `✅ AutoDash update, ${when(d.to, d.timeZone)}: nobody is waiting`;
  return `🚨 IMPORTANT: ${n} customer${n === 1 ? " is" : "s are"} waiting to hear from you${wrote ? ` (${wrote} wrote back 💬)` : ""}, ${when(d.to, d.timeZone)}`;
}

export function digestBody(d: DigestData): string {
  const tz = d.timeZone;
  const out: string[] = [`🚗 ${d.dealership}: customer update, ${when(d.to, tz)} (Dallas time)`, ""];
  if (d.waiting.length) {
    out.push(`🚨 ${d.waiting.length} CUSTOMER${d.waiting.length === 1 ? "" : "S"} WAITING TO BE CONTACTED`, "Reach out to these people as soon as you can. The quicker you answer, the better the chance of a visit.", "");
    d.waiting.forEach((p, i) => {
      out.push("━━━━━━━━━━━━━━━━━━━━", `${i + 1}. 👤 ${p.name?.trim() || "Name not given"}${p.replies.length ? "  💬 WROTE BACK" : ""}`);
      const how = isOfferUp(p) ? "no phone: answer in the OfferUp app" : [p.phone ? prettyPhone(p.phone) : null, p.email && !isOfferUp(p) ? p.email : null].filter(Boolean).join("  |  ") || "no phone or email given";
      out.push(`   📞 ${how}`);
      out.push(`   🚙 Wants: ${p.vehicle ?? "not said"}${p.provider ? `  (from ${p.provider}, ${when(p.at, tz, true)})` : `  (${when(p.at, tz, true)})`}`);
      if (p.message) out.push(`   🗣️ They said: "${clip(p.message, 240)}"`);
      if (p.ai === "sent") out.push(`   🤖 AI emailed them${p.aiSentAt ? ` at ${when(p.aiSentAt, tz)}` : ""}${p.aiText ? `: "${clip(p.aiText, 240)}"` : ""}`);
      else if (p.ai === "draft") out.push(`   📝 AI wrote a reply that is waiting for your OK${p.aiText ? `: "${clip(p.aiText, 200)}"` : ""}`);
      else out.push("   🤖 AI has not contacted them");
      for (const r of p.replies.slice(-3)) out.push(`   💬 They wrote back by ${r.via} at ${when(r.at, tz)}: "${clip(r.text, 240)}"`);
      if (p.link) out.push(`   👉 Talk to them: ${p.link}`);
    });
    out.push("━━━━━━━━━━━━━━━━━━━━", "");
  } else {
    out.push("✅ Nobody is waiting right now. Nice work.", "");
  }
  if (d.draftsWaiting) {
    out.push(`📝 ${d.draftsWaiting} AI repl${d.draftsWaiting === 1 ? "y is" : "ies are"} written and need${d.draftsWaiting === 1 ? "s" : ""} your OK before sending.${d.appUrl ? ` ${d.appUrl}/ai/emails` : ""}`, "");
  }
  if (d.appointments.length) {
    out.push("📅 APPOINTMENTS IN THE NEXT 24 HOURS");
    for (const a of d.appointments) out.push(`- ${when(a.at, tz, true)}: ${a.name}${a.phone ? ` ${prettyPhone(a.phone)}` : ""}${a.vehicle ? `, ${a.vehicle}` : ""}`);
    out.push("");
  }
  if (d.newCars.length || d.soldCars.length) {
    out.push("🚘 INVENTORY");
    for (const c of d.newCars) out.push(`- New on the website: ${c}`);
    for (const c of d.soldCars) out.push(`- Sold / gone from the website: ${c}`);
    out.push("");
  }
  if (d.appUrl) out.push(`🔗 Open AutoDash: ${d.appUrl}`);
  out.push("(Sent automatically by AutoDash. You can change how often under AI > Automations.)");
  return out.join("\n");
}
