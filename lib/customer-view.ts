// Combines what the lead emails say (automatic) with what staff set by hand (database) into one view per customer.
import type { Financing, Status } from "@/lib/db/data";
import type { Scope } from "@/lib/geo";

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
  followUpAt: string | null;
  returning: boolean;
  hasApplication: boolean;
  leadsCount: number;
  firstSeen: number;
  lastSeen: number;
  leads: { id: string; kind: "application" | "inquiry"; type: string; provider: string; at: number; vehicle: string | null }[];
  nextAppointment: { at: number; repName: string | null } | null;
};

