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
};

export type WebsiteLead = Contact & { source: string | null; comments: string | null; replyUrl: string | null };

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

function stopIndex(lines: string[], from: number, stops: RegExp) {
  const i = lines.findIndex((line, index) => index >= from && stops.test(line));
  return i === -1 ? lines.length : i;
}

export function parseFinanceApplication(html: string): FinanceApplication {
  const lines = htmlToLines(html);
  const idLine = lines.findIndex((line) => /^Application ID\s*:/i.test(line));
  const start = idLine === -1 ? lines.length : idLine + 1;
  const end = stopIndex(lines, start, /^(View Finance Application|Reply to|©)/i);
  return {
    ...readContact(lines.slice(start, end)),
    applicationId: field(lines, "Application ID") ?? null,
    loanAmount: money(field(lines, "Loan Amount")),
    downPayment: money(field(lines, "Down Payment")),
    source: field(lines, "Source") ?? null,
    viewUrl: linkByText(html, "View Finance Application"),
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
  };
}
