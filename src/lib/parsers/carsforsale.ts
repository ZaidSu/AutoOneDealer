// Parses CarsForSale notification emails received by the dealership inbox.
// Built from the real layouts seen in the Auto One inbox (September 2026).
// Only reads what the email actually contains; missing fields stay null rather than being guessed.
import { EMAIL, isPhone, readContact, type Contact } from "./contact.ts";
import { htmlToLines, linkByText } from "./html.ts";

export type CfsKind = "finance_application" | "website_lead" | "other";

export function classifyCfs(from: string, subject: string): CfsKind {
  if (!/carsforsalemail\.com/i.test(from)) return "other";
  if (/loan app/i.test(subject)) return "finance_application";
  if (/new lead/i.test(subject)) return "website_lead";
  return "other";
}

export type FinanceApplication = Contact & {
  applicationId: string | null;
  loanAmount: number | null;
  downPayment: number | null;
  source: string | null;
  viewUrl: string | null;
  /** From the "Vehicle Information" block that newer emails include. */
  vehicle: string | null;
  stock: string | null;
};

export type WebsiteLead = Contact & { source: string | null; comments: string | null; replyUrl: string | null; vehicle: string | null; stock: string | null };

function money(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function field(lines: string[], label: string): string | undefined {
  const pattern = new RegExp(`^${label}\\s*:\\s*(.+)$`, "i");
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

/** The "Vehicle Information" section CarsForSale puts in lead and application emails (Year / Make / Model / Stock #...). */
export function readVehicleBlock(lines: string[]): { vehicle: string | null; stock: string | null } {
  const at = lines.findIndex((line) => /^Vehicle Information$/i.test(line));
  if (at === -1) return { vehicle: null, stock: null };
  const end = stopIndex(lines, at + 1, /^(Comments|View Finance Application|Reply to|©)$|^(Comments|View Finance Application|Reply to|©)/i);
  const block = lines.slice(at + 1, end);
  const vehicle = [field(block, "Year"), field(block, "Make"), field(block, "Model")].filter(Boolean).join(" ") || null;
  const stock = field(block, "Stock\\s*#?");
  return { vehicle, stock: stock && /\d/.test(stock) ? stock : null };
}

function stopIndex(lines: string[], from: number, stops: RegExp) {
  const i = lines.findIndex((line, index) => index >= from && stops.test(line));
  return i === -1 ? lines.length : i;
}

/** Section headings and "Label: value" lines are never the applicant's name or phone. */
const HEADING = /^(finance application details|vehicle information|you have a new finance application!?|source\s*:.*)$/i;
const LABELED = /^[A-Za-z][A-Za-z #.\/]{0,24}\s*:/;

export function parseFinanceApplication(html: string): FinanceApplication {
  const lines = htmlToLines(html);
  // The applicant (name, phone, "City, ST") is the little block right above the "View Finance Application" button.
  // Emails used to put it straight after the Application ID; newer ones put a Vehicle Information section in between,
  // so counting from the button is what works for both.
  const button = lines.findIndex((line) => /^View Finance Application/i.test(line));
  const end = button === -1 ? stopIndex(lines, 0, /^(Reply to|©)/i) : button;
  const block: string[] = [];
  for (let i = end - 1; i >= 0 && block.length < 5; i--) {
    if (HEADING.test(lines[i]) || LABELED.test(lines[i])) break;
    block.unshift(lines[i]);
  }
  const { vehicle, stock } = readVehicleBlock(lines);
  return {
    ...readContact(block),
    applicationId: field(lines, "Application ID") ?? null,
    loanAmount: money(field(lines, "Loan Amount")),
    downPayment: money(field(lines, "Down Payment")),
    source: field(lines, "Source") ?? null,
    viewUrl: linkByText(html, "View Finance Application"),
    vehicle,
    stock,
  };
}

export function parseWebsiteLead(html: string): WebsiteLead {
  const lines = htmlToLines(html);
  const replyLine = lines.findIndex((line) => /^Reply to\b/i.test(line));
  const end = replyLine === -1 ? stopIndex(lines, 0, /^©/) : replyLine;

  // Contact lines sit directly above "Reply to"; walk upward while lines look like contact details.
  let contactStart = end;
  let sawPhoneOrEmail = false;
  for (let i = end - 1; i >= 0 && end - i <= 4; i--) {
    const line = lines[i];
    if (isPhone(line) || EMAIL.test(line)) sawPhoneOrEmail = true;
    else if (sawPhoneOrEmail && !/^(Comments|Source\s*:)/i.test(line)) {
      contactStart = i;
      break;
    } else break;
    contactStart = i;
  }

  const commentsAt = lines.findIndex((line) => /^Comments$/i.test(line));
  const comments = commentsAt === -1 ? null : lines.slice(commentsAt + 1, contactStart).join("\n") || null;

  return {
    ...readContact(lines.slice(contactStart, end)),
    source: field(lines, "Source") ?? null,
    comments,
    replyUrl: linkByText(html, "Reply to"),
    ...readVehicleBlock(lines),
  };
}
