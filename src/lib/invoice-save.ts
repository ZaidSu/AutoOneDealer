// Turns the items typed on an invoice (names and numbers) into catalog items. Pure, so the database and preview mode
// follow exactly the same rules, and it's unit tested (npm test).
import type { Item } from "./types.ts";
import type { LineInput } from "./validate.ts";

export type SavePlan = {
  /** Items that didn't exist yet and need creating. */
  newItems: Item[];
  /** Existing items that had no last-4 UPC and just got one from this invoice. */
  upcFills: { id: string; upc: string }[];
  /** The invoice's items in order, each pointing at a catalog item. */
  lines: { item_id: string; qty: number; unit_price: number; unit_cost: number; position: number; own_card: boolean }[];
};

const key = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Matches each typed line to a catalog item by name (ignoring capitals). When two items share a name, the last-4 UPC picks
 * between them; a new name (or the same name with a different last-4) becomes a new item. A line's UPC fills in an item
 * that didn't have one.
 */
export function planInvoiceSave(items: Item[], lines: LineInput[], uuid: () => string = () => crypto.randomUUID()): SavePlan {
  const byName = new Map<string, Item[]>();
  for (const it of items) byName.set(key(it.name), [...(byName.get(key(it.name)) ?? []), it]);
  const newItems: Item[] = [];
  const fills = new Map<string, string>();

  const byUpc = new Map<string, Item>();
  for (const it of items) if (it.upc && !byUpc.has(it.upc)) byUpc.set(it.upc, it);

  const planned = lines.map((l, position) => {
    const same = byName.get(key(l.name)) ?? [];
    // The last 4 of the UPC decides first: the same last 4 is the same item, whatever the invoice calls it.
    let item: Item | undefined = l.upc ? byUpc.get(l.upc) : undefined;
    if (!item) item = l.upc ? same.find((i) => !i.upc) : same[0];
    if (item && l.upc && !item.upc) { fills.set(item.id, l.upc); byUpc.set(l.upc, item); }
    if (!item) {
      item = { id: uuid(), name: l.name, upc: l.upc, sku: null, category: null };
      newItems.push(item);
      byName.set(key(l.name), [...same, item]);
      if (l.upc) byUpc.set(l.upc, item);
    }
    return { item_id: item.id, qty: l.qty, unit_price: l.price, unit_cost: l.cost, position, own_card: l.ownCard };
  });
  return { newItems, upcFills: [...fills].map(([id, upc]) => ({ id, upc })), lines: planned };
}
