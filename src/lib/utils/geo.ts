// In state / out of state from a lead's "City, ST". No project imports (unit tested directly).

export const HOME_STATE = "TX";

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

export type Scope = "in" | "out";

/** "Pineville, LA" → "LA". Returns null when there's no valid US state code. */
export function stateFromLocation(location: string | null | undefined): string | null {
  const match = String(location ?? "").match(/,\s*([A-Za-z]{2})(\s+\d{5}(-\d{4})?)?\s*$/);
  const code = match?.[1].toUpperCase();
  return code && code in STATES ? code : null;
}

export function scopeFor(state: string | null): Scope | null {
  if (!state) return null;
  return state === HOME_STATE ? "in" : "out";
}

export function stateName(code: string): string {
  return STATES[code] ?? code;
}
