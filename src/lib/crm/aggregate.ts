// One row per customer, kept up to date as each lead is saved (pure logic, unit tested).
// Pages read these ready-made rows instead of regrouping every lead on every visit.
import { betterName, type LeadRecord } from "../customers/index.ts";
import { scopeFor, stateFromLocation } from "../utils/geo.ts";

export type CustomerAgg = {
  key: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  stateCode: string | null;
  autoScope: "in" | "out" | null;
  vehicles: string[];
  providers: string[];
  firstSeen: number | null;
  lastSeen: number | null;
  leadCount: number;
  appCount: number;
  lastInquiryAt: number | null;
  lastAppAt: number | null;
  firstProvider: string | null;
  lastProvider: string | null;
  lastVehicle: string | null;
  loanAmount: number | null;
};

export function emptyAgg(key: string): CustomerAgg {
  return {
    key, name: null, phone: null, email: null, location: null, stateCode: null, autoScope: null, vehicles: [], providers: [],
    firstSeen: null, lastSeen: null, leadCount: 0, appCount: 0, lastInquiryAt: null, lastAppAt: null,
    firstProvider: null, lastProvider: null, lastVehicle: null, loanAmount: null,
  };
}

const max = (a: number | null, b: number) => (a === null || b > a ? b : a);

/** Adds one lead to a customer. Order-independent: works whether leads arrive oldest or newest first. */
export function mergeLead(current: CustomerAgg | null, lead: LeadRecord, key: string): CustomerAgg {
  const c = current ? { ...current, vehicles: [...current.vehicles], providers: [...current.providers] } : emptyAgg(key);
  const at = lead.receivedAt;
  const isNewest = c.lastSeen === null || at >= c.lastSeen;
  const isOldest = c.firstSeen === null || at <= c.firstSeen;

  c.name = betterName(c.name, lead.name);
  c.phone ??= lead.phone;
  c.email ??= lead.email ? lead.email.toLowerCase() : null;
  if (lead.location && (isNewest || !c.location)) c.location = lead.location;
  c.stateCode = stateFromLocation(c.location);
  c.autoScope = scopeFor(c.stateCode);
  if (lead.vehicle && !c.vehicles.some((v) => v.toLowerCase() === lead.vehicle!.toLowerCase()) && c.vehicles.length < 12) {
    if (isNewest) c.vehicles.unshift(lead.vehicle); else c.vehicles.push(lead.vehicle);
  }
  if (lead.provider && !c.providers.includes(lead.provider)) c.providers.push(lead.provider);
  if (isOldest) { c.firstSeen = at; c.firstProvider = lead.provider; }
  if (isNewest) { c.lastSeen = at; c.lastProvider = lead.provider; if (lead.vehicle) c.lastVehicle = lead.vehicle; }
  c.leadCount += 1;
  if (lead.kind === "application") {
    c.appCount += 1;
    c.lastAppAt = max(c.lastAppAt, at);
    if (lead.loanAmount !== null && lead.loanAmount !== undefined) c.loanAmount = Math.max(c.loanAmount ?? 0, lead.loanAmount);
  } else {
    c.lastInquiryAt = max(c.lastInquiryAt, at);
  }
  return c;
}

/** Lowercase text the customer search matches against (digits of the phone included as typed). */
export function searchText(c: Pick<CustomerAgg, "name" | "phone" | "email" | "vehicles" | "providers" | "location">): string {
  return [c.name, c.phone, c.email, ...c.vehicles, ...c.providers, c.location].filter(Boolean).join(" ").toLowerCase().slice(0, 2000);
}
