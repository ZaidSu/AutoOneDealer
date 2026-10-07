// Combines what the lead emails say (automatic) with what staff set by hand (database) into one view per customer.
import type { Financing, Status } from "@/lib/db/data";
import type { Scope } from "@/lib/utils/geo";

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
  /** When they were marked purchased, what they bought, and the after-purchase follow-up text. */
  purchasedAt: number | null;
  purchasedVehicle: string | null;
  followupSentAt: number | null;
  followupOff: boolean;
  /** The AI never emails or texts this customer by itself (staff still can). */
  aiPaused: boolean;
  returning: boolean;
  hasApplication: boolean;
  leadsCount: number;
  firstSeen: number;
  lastSeen: number;
  leads: { id: string; kind: "application" | "inquiry"; type: string; provider: string; at: number; vehicle: string | null }[];
  nextAppointment: { at: number; repName: string | null } | null;
};

