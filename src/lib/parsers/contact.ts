// Shared helpers for pulling contact details out of lead emails. No project imports (unit tested directly).

export type Contact = { name: string | null; phone: string | null; email: string | null; location: string | null };

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_ANYWHERE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_LINE = /^[+()\d\s.-]+$/;
const LOCATION = /,\s*[A-Za-z]{2}(\s+\d{5})?$/;

export function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhone(value: string | null | undefined): string | null {
  const d = digits(String(value ?? ""));
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return null;
}

export function isPhone(line: string) {
  return PHONE_LINE.test(line) && normalizePhone(line) !== null;
}

/** Reads a block of name / phone / email / "City, ST" lines in any order. */
export function readContact(lines: string[]): Contact {
  const contact: Contact = { name: null, phone: null, email: null, location: null };
  for (const line of lines) {
    if (!contact.phone && isPhone(line)) contact.phone = normalizePhone(line);
    else if (!contact.email && EMAIL.test(line)) contact.email = line.toLowerCase();
    else if (!contact.location && LOCATION.test(line)) contact.location = line.replace(/\s*,\s*/, ", ");
    else if (!contact.name) contact.name = line;
  }
  return contact;
}

/** Finds the first email in free text that isn't in the ignore list. */
export function findEmail(text: string, ignore: string[] = []): string | null {
  const skip = ignore.map((e) => e.toLowerCase());
  for (const match of text.match(EMAIL_ANYWHERE) ?? []) {
    const email = match.toLowerCase();
    if (!skip.includes(email) && !/(no-?reply|support|notifications?|leads?)@/.test(email)) return email;
  }
  return null;
}

/** Finds the first US phone number written anywhere in free text. */
export function findPhone(text: string): string | null {
  for (const match of text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) ?? []) {
    const phone = normalizePhone(match);
    if (phone) return phone;
  }
  return null;
}
