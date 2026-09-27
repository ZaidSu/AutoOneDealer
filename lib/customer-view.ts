// Combines what the lead emails say (automatic) with what staff set by hand (database) into one view per customer.
import type { Customer } from "@/lib/customers";
import type { Appointment, CustomerRecord, Financing, Rep, Status } from "@/lib/db/data";
import { scopeFor, stateFromLocation, type Scope } from "@/lib/geo";

export type CustomerView = {
  key: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  stateCode: string | null;
  scope: Scope | null;
  scopeIsAuto: boolean;
  vehicles: string[];
  providers: string[];
  heardFrom: string | null;
  heardFromIsAuto: boolean;
  repId: number | null;
  repName: string | null;
  status: Status;
  financing: Financing | null;
  financingIsAuto: boolean;
  notes: string;
  returning: boolean;
  hasApplication: boolean;
  leadsCount: number;
  firstSeen: number;
  lastSeen: number;
  leads: { id: string; kind: "application" | "inquiry"; type: string; provider: string; at: number; vehicle: string | null }[];
  nextAppointment: { at: number; repName: string | null } | null;
};

export function buildCustomerViews(
  customers: Customer[],
  records: Map<string, CustomerRecord>,
  reps: Rep[],
  appointments: Map<string, Appointment>,
): CustomerView[] {
  const repNames = new Map(reps.map((r) => [r.id, r.name]));
  return customers.map((c) => {
    const record = records.get(c.key);
    const stateCode = stateFromLocation(c.location);
    const autoScope = scopeFor(stateCode);
    const earliest = c.leads[c.leads.length - 1];
    const autoFinancing: Financing | null = c.hasApplication ? "needs_review" : null;
    const next = appointments.get(c.key);
    return {
      key: c.key,
      name: c.name,
      phone: c.phones[0] ?? null,
      email: c.emails[0] ?? null,
      location: c.location,
      stateCode,
      scope: record?.stateScope ?? autoScope,
      scopeIsAuto: !record?.stateScope,
      vehicles: c.vehicles,
      providers: c.sources,
      heardFrom: record?.heardFrom ?? earliest?.provider ?? null,
      heardFromIsAuto: !record?.heardFrom,
      repId: record?.repId ?? null,
      repName: record?.repId ? repNames.get(record.repId) ?? null : null,
      status: record?.status ?? "new",
      financing: record?.financing ?? autoFinancing,
      financingIsAuto: !record?.financing,
      notes: record?.notes ?? "",
      // Came back with a new lead after buying from us.
      returning: Boolean(record?.purchasedAt && c.lastSeen > record.purchasedAt.getTime() + 86400000),
      hasApplication: c.hasApplication,
      leadsCount: c.leads.length,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
      leads: c.leads.slice(0, 6).map((l) => ({ id: l.messageId, kind: l.kind, type: l.type, provider: l.provider, at: l.receivedAt, vehicle: l.vehicle })),
      nextAppointment: next ? { at: next.startsAt.getTime(), repName: next.repName } : null,
    };
  });
}
