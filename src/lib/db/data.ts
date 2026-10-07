// Reads everything the pages need. Money comes back as plain numbers and dates as "YYYY-MM-DD" text.
import { dbState, db, fresh, type DbState } from "./index";
import type { Data } from "../types";

type Sql = NonNullable<ReturnType<typeof db>>;

// One round trip: the whole data set comes back as a single JSON document. Each page used to send nine separate queries,
// which on a cold start meant opening several new connections to the database before anything could show.
const agg = (query: string) => `(select coalesce(json_agg(t), '[]'::json) from (${query}) t)`;
export const LOAD_ALL_SQL = `select json_build_object(
  'items', ${agg("select id, name, upc, sku, category from mw_items order by lower(name)")},
  'customers', ${agg("select id, name, default_tax_status, cert_file_id, notes from mw_customers order by lower(name)")},
  'contractors', ${agg("select id, name, phone, email, notes from mw_contractors order by lower(name)")},
  'payments', ${agg(`select id, contractor_id, amount::float8 as amount, paid_on::text as paid_on, method, reference, notes
        from mw_contractor_payments order by paid_on desc, created_at desc`)},
  'invoices', ${agg(`select id, kind, invoice_no, customer_id, invoice_date::text as invoice_date, status, paid_on::text as paid_on, file_id, notes,
        contractor_id, store, miles::float8 as miles, tax_status, sales_tax::float8 as sales_tax,
        total_override::float8 as total_override, cost_override::float8 as cost_override,
        their_card::float8 as their_card, my_card
        from mw_invoices order by invoice_date desc, created_at desc`)},
  'lines', ${agg(`select id, invoice_id, item_id, qty, unit_price::float8 as unit_price, unit_cost::float8 as unit_cost, position, own_card
        from mw_invoice_lines order by position, created_at`)},
  'expenses', ${agg(`select id, spent_on::text as spent_on, category, vendor, amount::float8 as amount, receipt_file_id, notes, business
        from mw_expenses order by spent_on desc, created_at desc`)},
  'projects', ${agg("select id, name, client, status, notes from mw_projects order by lower(name)")},
  'income', ${agg(`select id, received_on::text as received_on, source, project_id, amount::float8 as amount, notes
        from mw_income order by received_on desc, created_at desc`)},
  'contractor_invoices', ${agg(`select id, contractor_id, invoiced_on::text as invoiced_on, ref, notes from mw_contractor_invoices order by invoiced_on desc, created_at desc`)},
  'contractor_lines', ${agg(`select id, invoice_id, name, upc, qty, buy_price::float8 as buy_price, sell_price::float8 as sell_price, position
        from mw_contractor_invoice_lines order by position, id`)},
  'rates', ${agg("select key, value from mw_settings where key like 'mileage_rate_%'")},
  'quarters', ${agg("select year, quarter, finalized_at::text as finalized_at, note, snapshot from mw_quarters order by year desc, quarter desc")}
) as d`;

async function loadAll(sql: Sql): Promise<Data> {
  const [row] = await sql.unsafe(LOAD_ALL_SQL);
  const d = (typeof row.d === "string" ? JSON.parse(row.d) : row.d) as Record<string, any[]>;
  const mileageRates: Record<string, number> = {};
  for (const r of d.rates) {
    const rate = Number(r.value);
    if (Number.isFinite(rate) && rate > 0) mileageRates[String(r.key).replace("mileage_rate_", "")] = rate;
  }
  // The saved totals come back as an object; accept older text-encoded ones too.
  const quarters = d.quarters.map((r) => ({ ...r, snapshot: typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot }));
  const { rates: _rates, ...rest } = d;
  return { ...rest, settings: { mileageRates }, quarters } as unknown as Data;
}

export type Loaded = { state: "ready"; data: Data } | { state: Exclude<DbState, "ready"> };

/** What every page calls: the data when the database is ready, otherwise why not. */
export async function getData(): Promise<Loaded> {
  const state = await dbState();
  if (state !== "ready") return { state };
  try {
    const data = await fresh("load data", () => loadAll(db()!));
    return { state: "ready", data };
  } catch (error) {
    console.error("Loading data failed:", error instanceof Error ? error.message : "unknown");
    return { state: "unreachable" };
  }
}

export type StoredFile = { id: string; name: string; mime: string; data: Buffer };

export async function getFile(id: string): Promise<StoredFile | null> {
  const sql = db();
  if (!sql || !/^[\w-]{8,64}$/.test(id)) return null;
  const [row] = await fresh("load file", () => sql`select id, name, mime, data from mw_files where id = ${id}`);
  return row ? ({ id: row.id, name: row.name, mime: row.mime, data: Buffer.from(row.data) }) : null;
}
