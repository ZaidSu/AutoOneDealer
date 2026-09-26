// Turns any lead-notification email into one consistent lead record.
// Rules from the dealership: subject containing "Loan App" = credit application; subject containing "Lead" = lead.
// No project imports (unit tested directly).
import { containsAdf, parseAdf } from "./adf.ts";
import { parseFinanceApplication, parseWebsiteLead } from "./carsforsale.ts";
import { findEmail, findPhone, readContact } from "./contact.ts";
import { htmlToLines, htmlToText } from "./html.ts";

export type LeadKind = "application" | "inquiry";

export type ParsedLead = {
  kind: LeadKind;
  provider: string;
  type: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  vehicle: string | null;
  vin: string | null;
  stock: string | null;
  comments: string | null;
  applicationId: string | null;
  loanAmount: number | null;
  downPayment: number | null;
  viewUrl: string | null;
};

export type LeadEmail = { from: string; subject: string; text: string; html: string; mailbox?: string };

export function leadKind(subject: string): LeadKind | null {
  if (/^\s*(re|fwd?)\s*:/i.test(subject)) return null; // replies and forwards aren't new leads
  if (/loan app/i.test(subject)) return "application";
  if (/\blead\b/i.test(subject)) return "inquiry";
  return null;
}

const PROVIDERS: [RegExp, string][] = [
  [/carsforsale/i, "CarsForSale"],
  [/cars\.com/i, "Cars.com"],
  [/edmunds/i, "Edmunds"],
  [/cargurus/i, "CarGurus"],
  [/carzing/i, "CarZing"],
  [/autotrader/i, "Autotrader"],
  [/truecar/i, "TrueCar"],
  [/facebook|meta/i, "Facebook"],
  [/hammer/i, "Hammer"],
];

export function providerFor(from: string, subject = ""): string {
  const haystack = `${from} ${subject}`;
  for (const [pattern, name] of PROVIDERS) if (pattern.test(haystack)) return name;
  const domain = from.match(/@([\w.-]+)/)?.[1] ?? "";
  return domain.replace(/^(mail|email|reply|notify|leads?)\./, "") || "Email";
}

function typeFromSubject(subject: string, kind: LeadKind): string {
  if (kind === "application") return "Credit application";
  if (/phone|call/i.test(subject)) return "Phone call";
  if (/chat/i.test(subject)) return "Chat";
  if (/\b(text|sms)\b/i.test(subject)) return "Text message";
  return "Inquiry";
}

/** "Cars.com Phone Lead Notice for Auto One Motors - 2014 Cadillac Cts" → "2014 Cadillac Cts" */
function vehicleFromSubject(subject: string): string | null {
  const match = subject.match(/\b((19|20)\d{2}\s+[A-Za-z][\w-]*(\s+[\w-]+){0,2})\s*$/);
  return match ? match[1].trim() : null;
}

function labeled(lines: string[], labels: string[]): string | null {
  const pattern = new RegExp(`^(${labels.join("|")})\\s*:\\s*(.+)$`, "i");
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[2].trim();
  }
  return null;
}

/** Reads "Label:" sections like Cars.com's "From:" block and "Comments:" block. */
function section(lines: string[], heading: string): string[] {
  const start = lines.findIndex((line) => new RegExp(`^${heading}\\s*:?\\s*$`, "i").test(line));
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^-{2,}$/.test(line) || /^[A-Z][\w ]{1,30}:\s*$/.test(line)) break;
    out.push(line);
  }
  return out;
}

function empty(kind: LeadKind, provider: string, type: string): ParsedLead {
  return {
    kind, provider, type, name: null, phone: null, email: null, location: null, vehicle: null, vin: null,
    stock: null, comments: null, applicationId: null, loanAmount: null, downPayment: null, viewUrl: null,
  };
}

export function parseLead(email: LeadEmail): ParsedLead | null {
  const kind = leadKind(email.subject);
  if (!kind) return null;
  const provider = providerFor(email.from, email.subject);
  const lead = empty(kind, provider, typeFromSubject(email.subject, kind));
  const ignore = [email.mailbox ?? ""].filter(Boolean);

  // 1. CarsForSale's own layouts.
  if (/carsforsalemail\.com/i.test(email.from) && email.html) {
    if (kind === "application") {
      const app = parseFinanceApplication(email.html);
      return {
        ...lead, name: app.name, phone: app.phone, email: app.email, location: app.location,
        applicationId: app.applicationId, loanAmount: app.loanAmount, downPayment: app.downPayment, viewUrl: app.viewUrl,
      };
    }
    const web = parseWebsiteLead(email.html);
    return { ...lead, name: web.name, phone: web.phone, email: web.email, location: web.location, comments: web.comments, viewUrl: web.replyUrl, type: "Website inquiry" };
  }

  // 2. ADF / XML leads (Edmunds, CarGurus, Autotrader…). The XML may be in the text part or escaped inside HTML.
  const adfSource = containsAdf(email.text) ? email.text : email.html && containsAdf(htmlToText(email.html)) ? htmlToText(email.html) : null;
  if (adfSource) {
    const adf = parseAdf(adfSource);
    return {
      ...lead,
      ...adf,
      provider: adf.provider && provider === "Email" ? adf.provider : provider,
      type: adf.type ?? lead.type,
    };
  }

  // 3. Labeled text layouts (Cars.com and similar). Use whichever version of the body has more detail.
  const textLines = email.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const htmlLines = email.html ? htmlToLines(email.html) : [];
  const lines = htmlLines.length > textLines.length * 1.5 && !textLines.some((l) => /^From\s*:?$/i.test(l)) ? htmlLines : textLines;
  const all = lines.join("\n");

  const fromBlock = readContact(section(lines, "From").slice(0, 5));
  const first = labeled(lines, ["First Name"]);
  const last = labeled(lines, ["Last Name"]);
  const year = labeled(lines, ["Year"]);
  const make = labeled(lines, ["Make"]);
  const model = labeled(lines, ["Model"]);
  const commentLines = section(lines, "Comments");

  return {
    ...lead,
    name: fromBlock.name ?? labeled(lines, ["Name", "Full Name", "Customer Name", "Customer"]) ?? ([first, last].filter(Boolean).join(" ") || null),
    phone: fromBlock.phone ?? findPhone(labeled(lines, ["Phone", "Phone Number", "Mobile", "Cell"]) ?? "") ?? findPhone(all),
    email: fromBlock.email ?? findEmail(labeled(lines, ["Email", "E-mail", "Email Address"]) ?? "", ignore) ?? findEmail(all, ignore),
    location: fromBlock.location,
    vehicle: [year, make, model].filter(Boolean).join(" ") || vehicleFromSubject(email.subject),
    vin: labeled(lines, ["VIN"]),
    stock: labeled(lines, ["Stock Number", "Stock #", "Stock"]),
    comments: commentLines.length ? commentLines.join("\n").slice(0, 1500) : labeled(lines, ["Comments", "Message", "Question"]),
  };
}
