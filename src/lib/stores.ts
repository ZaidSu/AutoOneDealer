// The stores you buy from, in their own colors. The store is saved as plain text, so any other store still works (shown in gray).
export type StoreStyle = { name: string; bg: string; fg: string };

export const STORES: StoreStyle[] = [
  { name: "Walmart", bg: "#0071CE", fg: "#FFFFFF" },
  { name: "Amazon", bg: "#FF9900", fg: "#111111" },
  { name: "Best Buy", bg: "#0046BE", fg: "#FFE000" },
  { name: "Target", bg: "#CC0000", fg: "#FFFFFF" },
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** The brand colors for a store name ("walmart", "Best Buy" and "bestbuy" all work), or null for any other store. */
export function storeStyle(name: string | null | undefined): StoreStyle | null {
  if (!name) return null;
  return STORES.find((s) => key(s.name) === key(name)) ?? null;
}
