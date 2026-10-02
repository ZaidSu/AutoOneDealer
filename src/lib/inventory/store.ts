// The dealership's inventory, kept in the database: every car on the website, when we first saw it, and what sold.
// The timer copies the website here every 5 minutes. A car that disappears from the website for 3 checks in a row
// (15 minutes, with every page read each time) is recorded as sold; staff can correct that by hand.
import { readyDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { fetchInventory, type Inventory } from "./fetch";
import { seedText } from "./seed";
import { makeAndModel, mergePageStore, pagesToRead, parsePastedInventory, SITE_PAGE, type Listing, type PageStore } from "./match";

export type SyncState = { at: number; ok: boolean; count: number; complete: boolean; added: number; sold: number; error: string | null; via?: "direct" | "helper" | "pushed" | "pasted"; pagesRead?: number; pagesExpected?: number | null };
const SYNC_KEY = "inventory_sync";

export async function getSyncState(): Promise<SyncState | null> {
  try { const raw = await getSetting(SYNC_KEY); return raw ? (JSON.parse(raw) as SyncState) : null; } catch { return null; }
}

const FRESH_MS = 30 * 60_000;
/** A pasted copy stays trusted for a day (like a daily feed would). The website's own reads are only trusted for 30 minutes. */
const PASTED_FRESH_MS = 24 * 3600_000;

/** Reads the website from the server (the timer does this every 5 minutes). If the dealership computer has sent the
 *  inventory recently, that is used instead and the website isn't read from here. */
export async function syncInventory(opts: { force?: boolean } = {}): Promise<SyncState> {
  const prev = await getSyncState();
  // A copy sent from the dealership computer, or pasted by hand, is used instead of reading the website from here.
  if (!opts.force && prev?.ok && ((prev.via === "pushed" && Date.now() - prev.at < 40 * 60_000) || (prev.via === "pasted" && Date.now() - prev.at < PASTED_FRESH_MS))) return prev;
  let inv: Inventory;
  const saved = await loadPageStore();
  // The timer reads page 1 plus the two pages most in need of a fresh copy. A manual "Check website now" reads everything.
  const pick = opts.force ? undefined : (expected: number) => pagesToRead(expected, saved, Date.now(), PAGE_MAX_AGE_MS, 2);
  try { inv = await fetchInventory({ pick }); } catch (e) { return recordFailure(e instanceof Error ? e.message : "Couldn't read the website", prev); }
  return applyInventory(await mergeWithRecent(inv));
}

const PAGES_KEY = "inventory_pages";
const PAGE_MAX_AGE_MS = 25 * 60_000;
async function loadPageStore(): Promise<PageStore> {
  try { const raw = await getSetting(PAGES_KEY); return raw ? (JSON.parse(raw) as PageStore) : {}; } catch { return {}; }
}
/** Adds pages read in the last 25 minutes to this read, so pages read on different runs still add up to the whole website. */
async function mergeWithRecent(inv: Inventory): Promise<Inventory> {
  if (!inv.parts) return inv;
  const m = mergePageStore(await loadPageStore(), inv.parts, Date.now(), PAGE_MAX_AGE_MS);
  await setSetting(PAGES_KEY, JSON.stringify(m.store)).catch(() => undefined);
  return { ...inv, listings: m.listings, complete: m.complete, pagesRead: m.read, pagesExpected: m.expected };
}

/** A failed read is saved so the Inventory page can say why, unless a good copy from the last 30 minutes exists (then that one stays). */
async function recordFailure(error: string, prev: SyncState | null): Promise<SyncState> {
  if (prev?.ok && Date.now() - prev.at < (prev.via === "pasted" ? PASTED_FRESH_MS : FRESH_MS)) return { ...prev, ok: false, error };
  const state: SyncState = { at: Date.now(), ok: false, count: prev?.count ?? 0, complete: false, added: 0, sold: 0, error };
  await setSetting(SYNC_KEY, JSON.stringify(state)).catch(() => undefined);
  return state;
}

/** Saves a read of the website (from the server, or sent by the dealership computer) into the inventory table. */
export async function applyInventory(inv: Inventory): Promise<SyncState> {
  const sql = await readyDb();
  if (!sql) return recordFailure("The database isn't connected.", await getSyncState());
  const started = new Date();
  const toRow = (l: Listing) => {
    const { make, model } = makeAndModel(l);
    return { id: l.id, finance_id: l.financeId, url: l.url, year: l.year, make, model, slug: l.slug, title: l.title || `${l.year ?? ""} ${make} ${model}`.trim(), price: l.price, mileage: l.mileage };
  };
  const live = inv.listings.filter((l) => !l.sold).map(toRow);
  const flagged = inv.listings.filter((l) => l.sold).map(toRow);
  const shape = "id text, finance_id text, url text, year int, make text, model text, slug text, title text, price int, mileage int";
  const cols = "id, finance_id, url, year, make, model, slug, title, price, mileage";
  let added = 0;
  const before = new Set((await sql`select id from inventory`).map((r) => r.id as string));
  added = live.filter((r) => !before.has(r.id)).length;

  for (let i = 0; i < live.length; i += 200) {
    await sql`insert into inventory (${sql.unsafe(cols)}, status, last_seen, missed)
      select ${sql.unsafe(cols)}, 'available', now(), 0 from jsonb_to_recordset(${sql.json(live.slice(i, i + 200))}::jsonb) as x(${sql.unsafe(shape)})
      on conflict (id) do update set finance_id = excluded.finance_id, url = excluded.url, year = excluded.year, make = excluded.make, model = excluded.model,
        slug = excluded.slug, title = excluded.title, price = excluded.price, mileage = excluded.mileage, last_seen = now(), missed = 0, updated_at = now(),
        -- A car that left the website and came back is available again, unless staff marked it sold by hand.
        -- A deleted car stays deleted even if the website lists it. Otherwise: available again, unless staff marked it sold by hand.
        status = case when inventory.status = 'deleted' then 'deleted' when inventory.sold_by is not null then inventory.status else 'available' end,
        sold_at = case when inventory.sold_by is not null then inventory.sold_at else null end,
        sold_price = case when inventory.sold_by is not null then inventory.sold_price else null end,
        sold_note = case when inventory.sold_by is not null then inventory.sold_note else null end`;
  }
  // Cards the website itself marks Sold. A car we had seen for sale and now see as Sold sold sometime since: dated now. One we are
  // meeting for the first time already Sold has no known date or price, so it's kept out of AutoDash entirely (status "ignored").
  let soldNow = 0;
  for (let i = 0; i < flagged.length; i += 200) {
    const rows = await sql`insert into inventory (${sql.unsafe(cols)}, status, last_seen, sold_at, sold_price, sold_note)
      select ${sql.unsafe(cols)}, 'ignored', now(), null, null, 'Already Sold on the website when first seen' from jsonb_to_recordset(${sql.json(flagged.slice(i, i + 200))}::jsonb) as x(${sql.unsafe(shape)})
      on conflict (id) do update set last_seen = now(), updated_at = now(),
        status = 'sold', sold_at = now(), sold_price = coalesce(inventory.sold_price, inventory.price, excluded.price),
        sold_note = 'Marked sold on the website'
      where inventory.status = 'available' returning (xmax = 0) as inserted`;
    soldNow += rows.filter((r) => !r.inserted).length;
  }
  // A car deleted by staff (not the dealership's own) stays deleted: any other row for the same car (same name and mileage), like one
  // that the website lists under a new id, is deleted too.
  await sql`update inventory r set status = 'deleted', updated_at = now() where r.status <> 'deleted' and exists (
    select 1 from inventory d where d.status = 'deleted' and d.id <> r.id and lower(d.title) = lower(r.title) and d.mileage is not distinct from r.mileage)`;
  // Cars added from pasted text have made-up ids. Once the website itself has been read in full, the real listing replaces them.
  if (inv.complete && inv.via !== "pasted") {
    await sql`delete from inventory t where t.id like 'txt-%' and exists (
      select 1 from inventory r where r.id not like 'txt-%' and lower(r.title) = lower(t.title) and r.mileage is not distinct from t.mileage and r.status = t.status)`;
  }
  // Cars that weren't on the website this time. Only counted when every page was read, so a half-loaded website
  // can't make cars look sold; and only after 3 checks in a row.
  if (inv.complete) {
    await sql`update inventory set missed = missed + 1, updated_at = now() where status = 'available' and last_seen < ${started}`;
    const gone = await sql`update inventory set status = 'sold', sold_at = now(), sold_price = price, sold_by = null, sold_note = 'Left the website', updated_at = now()
      where status = 'available' and missed >= 3 returning id`;
    soldNow += gone.length;
  }
  const state: SyncState = { at: Date.now(), ok: true, count: live.length, complete: inv.complete, added, sold: soldNow, error: null, via: inv.via, pagesRead: inv.pagesRead, pagesExpected: inv.pagesExpected };
  await setSetting(SYNC_KEY, JSON.stringify(state)).catch(() => undefined);
  return state;
}

// ---- reading ----
export type StoredCar = {
  id: string; url: string | null; year: number | null; make: string | null; model: string | null; slug: string | null; title: string; price: number | null; mileage: number | null;
  status: "available" | "sold" | "deleted"; firstSeen: number; lastSeen: number; soldAt: number | null; soldPrice: number | null; soldBy: string | null; soldNote: string | null;
};
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
const toCar = (r: Record<string, unknown>): StoredCar => ({
  id: r.id as string, url: (r.url as string) ?? null, year: (r.year as number) ?? null, make: (r.make as string) ?? null, model: (r.model as string) ?? null, slug: (r.slug as string) ?? null,
  title: (r.title as string) || [r.year, r.make, r.model].filter(Boolean).join(" "), price: (r.price as number) ?? null, mileage: (r.mileage as number) ?? null,
  status: r.status as "available" | "sold" | "deleted", firstSeen: ms(r.first_seen) ?? 0, lastSeen: ms(r.last_seen) ?? 0, soldAt: ms(r.sold_at), soldPrice: (r.sold_price as number) ?? null,
  soldBy: (r.sold_by as string) ?? null, soldNote: (r.sold_note as string) ?? null,
});

export async function listCars(status: "available" | "sold" | "deleted", limit = 200): Promise<StoredCar[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = status === "available"
    ? await sql`select * from inventory where status = 'available' order by price desc nulls last limit ${limit}`
    : status === "deleted"
    ? await sql`select * from inventory where status = 'deleted' order by updated_at desc limit ${limit}`
    : await sql`select * from inventory where status = 'sold' order by sold_at desc nulls last limit ${limit}`;
  return rows.map(toCar);
}

const SNAPSHOT_MAX_AGE_MS = 30 * 60_000;
/** What the AI reads: the saved copy of the website, if it was refreshed in the last 30 minutes. Null if it's too old. */
export async function readSnapshot(): Promise<{ listings: Listing[]; sold: Listing[]; complete: boolean; fetchedAt: number } | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const state = await getSyncState();
  if (!state?.ok || Date.now() - state.at > (state.via === "pasted" ? PASTED_FRESH_MS : SNAPSHOT_MAX_AGE_MS)) return null;
  const [avail, sold] = await Promise.all([
    sql`select * from inventory where status = 'available'`,
    sql`select * from inventory where status = 'sold' and (sold_at is null or sold_at > now() - interval '90 days') and slug is not null`,
  ]);
  if (avail.length === 0) return null;
  const toListing = (r: Record<string, unknown>, isSold: boolean): Listing => ({
    id: r.id as string, financeId: (r.finance_id as string) ?? null, url: (r.url as string) ?? "", year: (r.year as number) ?? null, slug: (r.slug as string) ?? "",
    title: (r.title as string) ?? "", price: (r.price as number) ?? null, mileage: (r.mileage as number) ?? null, sold: isSold,
  });
  return { listings: avail.map((r) => toListing(r, false)), sold: sold.map((r) => toListing(r, true)), complete: state.complete, fetchedAt: state.at };
}

// ---- by hand ----
export async function markSold(id: string, price: number | null, soldOn: Date, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update inventory set status = 'sold', sold_at = ${soldOn}, sold_price = coalesce(${price}, price), sold_by = ${by}, sold_note = 'Marked sold by staff', updated_at = now() where id = ${id}`;
}
export async function markAvailable(id: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  // Back on the lot. Cleared of the sale; the website decides from here (if it's still listed it stays available).
  await sql`update inventory set status = 'available', sold_at = null, sold_price = null, sold_by = null, sold_note = null, missed = 0, last_seen = now(), updated_at = now() where id = ${id}`;
}
export async function addSale(input: { title: string; year: number | null; price: number; soldOn: Date }, by: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const slug = input.title.replace(/^\s*(?:19|20)\d{2}\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { make, model } = makeAndModel({ title: input.title, slug, year: input.year });
  await sql`insert into inventory (id, title, year, make, model, slug, price, status, sold_at, sold_price, sold_by, sold_note, last_seen)
    values (${`manual-${Date.now()}`}, ${input.title}, ${input.year}, ${make}, ${model}, ${slug}, ${input.price}, 'sold', ${input.soldOn}, ${input.price}, ${by}, 'Added by staff', now())`;
}

// ---- numbers for the page ----
export type InventoryStats = {
  available: number; sold: number; soldUnknown: number; avgAsking: number | null; totalAsking: number | null; soldTotal: number; avgSold: number | null;
  byMonth: { month: string; n: number; total: number }[];
  byMake: { make: string; n: number; avg: number | null }[];
  byPrice: { label: string; n: number }[];
  lotByMake: { make: string; n: number }[];
};

export async function inventoryStats(timeZone: string): Promise<InventoryStats> {
  const sql = await readyDb();
  const empty: InventoryStats = { available: 0, sold: 0, soldUnknown: 0, avgAsking: null, totalAsking: null, soldTotal: 0, avgSold: null, byMonth: [], byMake: [], byPrice: [], lotByMake: [] };
  if (!sql) return empty;
  const [[c], months, makes, prices, lot] = await Promise.all([
    sql`select count(*) filter (where status = 'available')::int as available, count(*) filter (where status = 'sold')::int as sold, count(*) filter (where status = 'sold' and sold_at is null)::int as sold_unknown,
        avg(price) filter (where status = 'available')::float8 as avg_asking, sum(price) filter (where status = 'available')::float8 as total_asking,
        coalesce(sum(sold_price) filter (where status = 'sold' and sold_at is not null), 0)::float8 as sold_total, avg(sold_price) filter (where status = 'sold' and sold_at is not null)::float8 as avg_sold from inventory`,
    sql`select to_char(sold_at at time zone ${timeZone}, 'YYYY-MM') as m, count(*)::int as n, coalesce(sum(sold_price), 0)::float8 as total
        from inventory where status = 'sold' and sold_at is not null group by 1 order by 1 desc limit 12`,
    sql`select coalesce(make, 'Unknown') as make, count(*)::int as n, avg(sold_price)::float8 as avg from inventory where status = 'sold' and sold_at is not null group by 1 order by n desc, make limit 10`,
    sql`select case when sold_price is null then 'Price not known' when sold_price < 10000 then 'Under $10,000' when sold_price < 15000 then '$10,000 to $14,999'
          when sold_price < 20000 then '$15,000 to $19,999' when sold_price < 30000 then '$20,000 to $29,999' else '$30,000 and up' end as label, count(*)::int as n
        from inventory where status = 'sold' and sold_at is not null group by 1`,
    sql`select coalesce(make, 'Unknown') as make, count(*)::int as n from inventory where status = 'available' group by 1 order by n desc, make limit 10`,
  ]);
  const ORDER = ["Under $10,000", "$10,000 to $14,999", "$15,000 to $19,999", "$20,000 to $29,999", "$30,000 and up", "Price not known"];
  return {
    available: c.available, sold: c.sold, soldUnknown: c.sold_unknown, avgAsking: c.avg_asking, totalAsking: c.total_asking, soldTotal: c.sold_total, avgSold: c.avg_sold,
    byMonth: months.map((r) => ({ month: r.m as string, n: r.n as number, total: r.total as number })).reverse(),
    byMake: makes.map((r) => ({ make: r.make as string, n: r.n as number, avg: (r.avg as number) ?? null })),
    byPrice: ORDER.map((label) => ({ label, n: (prices.find((r) => r.label === label)?.n as number) ?? 0 })).filter((p) => p.n > 0),
    lotByMake: lot.map((r) => ({ make: r.make as string, n: r.n as number })),
  };
}

// ---- pasted from the website ----
export type PasteResult = { state: SyncState; cars: number; available: number; soldOnSite: number; total: number | null };

/** Cars from text copied off the website's inventory pages. A car already in the table (matched by its name and mileage) is
 *  updated in place; new ones get a made-up id until the website itself can be read. */
export async function importPasted(text: string): Promise<PasteResult> {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const { cars, total } = parsePastedInventory(text);
  if (cars.length === 0) throw new Error("no_cars");
  const existing = await sql`select id, title, mileage, url, finance_id from inventory order by (id like 'txt-%') asc`;
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of existing) { const k = `${String(r.title ?? "").toLowerCase()}|${r.mileage ?? ""}`; if (!byKey.has(k)) byKey.set(k, r); }
  const used = new Set<string>();
  const listings: Listing[] = cars.map((c) => {
    const hit = byKey.get(`${c.title.toLowerCase()}|${c.mileage ?? ""}`);
    let id = hit ? String(hit.id) : `txt-${c.slug}-${c.year}-${c.mileage ?? "x"}`;
    for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`;
    used.add(id);
    return { id, financeId: (hit?.finance_id as string) ?? null, url: (hit?.url as string) ?? "", year: c.year, slug: c.slug, title: c.title, price: c.price, mileage: c.mileage, sold: c.sold };
  });
  const complete = total != null && cars.length >= total;
  const state = await applyInventory({ listings, complete, fetchedAt: Date.now(), via: "pasted" });
  return { state, cars: cars.length, available: cars.filter((c) => !c.sold).length, soldOnSite: cars.filter((c) => c.sold).length, total };
}

const SEED_FLAG = "inventory_seed_oct2";
/** One time: loads the 82 cars from the website's pages as of Oct 2, 2026 (see seed.ts), so the AI can answer "is it available?"
 *  before AutoDash can read the website itself. Skipped if the inventory is already mostly filled in some other way. */
export async function seedInventoryOnce(): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  if (await getSetting(SEED_FLAG).catch(() => null)) return false;
  const state = await getSyncState();
  const [{ n }] = await sql`select count(*)::int as n from inventory`;
  if ((state?.ok && state.via === "pushed") || n >= 80) { await setSetting(SEED_FLAG, "skipped").catch(() => undefined); return false; }
  await importPasted(seedText());
  await setSetting(SEED_FLAG, "done").catch(() => undefined);
  return true;
}

/** For cars that aren't the dealership's (they're on the website for someone else): gone from the lot, the sold list, every number, and the AI.
 *  Stays deleted even if the website keeps listing it. Restore brings it back. */
export async function removeCar(id: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update inventory set status = 'deleted', sold_note = 'Deleted by staff', updated_at = now() where id = ${id}`;
}
