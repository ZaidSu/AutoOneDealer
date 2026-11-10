// Recent sales for the Registration area: every customer marked as having bought a car lately, with where their registration is.
import { readyDb } from "@/lib/db";

export type SaleRow = {
  key: string; name: string | null; phone: string | null; vehicle: string | null; purchasedAt: number; price: number | null; vin: string | null;
  regId: number | null; stage: string | null; deferred: boolean; hasPhoto: boolean;
};
export type LotCar = { id: string; title: string; vin: string | null; price: number | null };

export async function recentSales(days = 120, limit = 120): Promise<SaleRow[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`
    select c.key, c.name, c.phone, coalesce(c.purchased_vehicle, c.last_vehicle) as vehicle, c.purchased_at, i.sold_price, i.vin,
           r.id as reg_id, r.stage, r.deferred, r.has_photo
    from customers c
    left join lateral (select sold_price, vin from inventory where sold_customer_key = c.key and status = 'sold' order by sold_at desc nulls last limit 1) i on true
    left join lateral (select id, stage, deferred, (photo is not null) as has_photo from registrations where customer_key = c.key order by created_at desc limit 1) r on true
    where c.status = 'purchased' and c.purchased_at is not null and c.purchased_at > now() - make_interval(days => ${days})
    order by c.purchased_at desc limit ${limit}`;
  return rows.map((r) => ({
    key: r.key as string, name: (r.name as string) ?? null, phone: (r.phone as string) ?? null, vehicle: (r.vehicle as string) ?? null,
    purchasedAt: new Date(r.purchased_at as string).getTime(), price: (r.sold_price as number) ?? null, vin: (r.vin as string) ?? null,
    regId: r.reg_id ? Number(r.reg_id) : null, stage: (r.stage as string) ?? null, deferred: Boolean(r.deferred), hasPhoto: Boolean(r.has_photo),
  }));
}

/** Cars for sale right now, so a sale can be logged by picking one instead of typing it. */
export async function lotCars(): Promise<LotCar[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select id, title, vin, price from inventory where status = 'available' order by title limit 400`;
  return rows.map((r) => ({ id: r.id as string, title: (r.title as string) ?? "", vin: (r.vin as string) ?? null, price: (r.price as number) ?? null }));
}
