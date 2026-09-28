// Groups lead emails into customers. Pure logic (unit tested directly).
// The same person is recognized by phone number first, then email address.
import type { ParsedLead } from "./parsers/leads.ts";

export type LeadRecord = ParsedLead & { messageId: string; receivedAt: number };

export type Customer = {
  key: string;
  name: string | null;
  phones: string[];
  emails: string[];
  location: string | null;
  vehicles: string[];
  sources: string[];
  leads: LeadRecord[];
  hasApplication: boolean;
  firstSeen: number;
  lastSeen: number;
};

/** Stable, URL-safe id for a customer: "p-4695550100" or "e-<base64url email>". */
export function customerKey(lead: Pick<ParsedLead, "phone" | "email">): string | null {
  if (lead.phone) return `p-${lead.phone}`;
  if (lead.email) return `e-${Buffer.from(lead.email.toLowerCase()).toString("base64url")}`;
  return null;
}

export function parseCustomerKey(key: string): { phone: string } | { email: string } | null {
  if (/^p-\d{10}$/.test(key)) return { phone: key.slice(2) };
  if (/^e-[\w-]{4,200}$/.test(key)) {
    const email = Buffer.from(key.slice(2), "base64url").toString("utf8");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : null;
  }
  return null;
}

export function betterName(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  const shouting = (n: string) => n === n.toUpperCase();
  // Prefer properly-cased names over ALL CAPS, then fuller names.
  if (shouting(current) && !shouting(candidate)) return candidate;
  if (shouting(current) === shouting(candidate) && candidate.split(" ").length > current.split(" ").length) return candidate;
  return current;
}

export function groupCustomers(leads: LeadRecord[]): Customer[] {
  const byKey = new Map<string, Customer>();
  const emailToKey = new Map<string, string>();
  const phoneToKey = new Map<string, string>();

  // Oldest first, so a later lead with both phone and email can join an earlier email-only record.
  for (const lead of [...leads].sort((a, b) => a.receivedAt - b.receivedAt)) {
    let key = customerKey(lead);
    if (!key) continue;
    const email = lead.email ? lead.email.toLowerCase() : null; // the same address in any capitalization
    if (lead.phone && phoneToKey.has(lead.phone)) key = phoneToKey.get(lead.phone)!;
    else if (email && emailToKey.has(email) && !byKey.has(key)) key = emailToKey.get(email)!;

    const customer = byKey.get(key) ?? {
      key, name: null, phones: [], emails: [], location: null, vehicles: [], sources: [], leads: [],
      hasApplication: false, firstSeen: lead.receivedAt, lastSeen: lead.receivedAt,
    };
    customer.name = betterName(customer.name, lead.name);
    if (lead.phone && !customer.phones.includes(lead.phone)) customer.phones.push(lead.phone);
    if (email && !customer.emails.includes(email)) customer.emails.push(email);
    if (lead.location) customer.location = lead.location;
    if (lead.vehicle && !customer.vehicles.some((v) => v.toLowerCase() === lead.vehicle!.toLowerCase())) customer.vehicles.push(lead.vehicle);
    if (!customer.sources.includes(lead.provider)) customer.sources.push(lead.provider);
    if (lead.kind === "application") customer.hasApplication = true;
    customer.leads.push(lead);
    customer.firstSeen = Math.min(customer.firstSeen, lead.receivedAt);
    customer.lastSeen = Math.max(customer.lastSeen, lead.receivedAt);
    byKey.set(key, customer);
    if (email && !emailToKey.has(email)) emailToKey.set(email, key);
    if (lead.phone && !phoneToKey.has(lead.phone)) phoneToKey.set(lead.phone, key);
  }

  for (const customer of byKey.values()) customer.leads.sort((a, b) => b.receivedAt - a.receivedAt);
  return [...byKey.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}
