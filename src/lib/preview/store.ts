// Preview mode's data: saved in this browser (localStorage for rows, IndexedDB for uploaded files).
// Nothing leaves the device. Client-only.
import { legacyToNew, type LegacyInput } from "../legacy.ts";
import type { Data } from "../types.ts";

const KEY = "mw-preview-data-v2";
const OLD_KEY = "mw-preview-data-v1"; // the version with separate purchases and sales; converted on first load

const blank = (): Data => ({
  settings: { mileageRates: {} }, quarters: [],
  items: [], contractors: [], payments: [], invoices: [], lines: [], expenses: [], projects: [], income: [], contractor_invoices: [], contractor_lines: [],
  customers: [{ id: crypto.randomUUID(), name: "BWWI", default_tax_status: "resale", cert_file_id: null, notes: null }],
});

// Same ordering the database queries use: names A to Z, records newest first.
function sorted(d: Data): Data {
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  const newest = <T,>(key: (r: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));
  d.items.sort(byName); d.customers.sort(byName); d.contractors.sort(byName);
  d.payments.sort(newest((r) => r.paid_on));
  d.invoices.sort(newest((r) => r.invoice_date)); d.expenses.sort(newest((r) => r.spent_on)); d.income.sort(newest((r) => r.received_on)); d.contractor_invoices.sort(newest((r) => r.invoiced_on));
  return d;
}

let cache: Data | null = null;
const listeners = new Set<() => void>();

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sorted({ ...blank(), ...JSON.parse(raw) });
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old) as LegacyInput & Record<string, unknown>;
      const r = legacyToNew({ items: o.items ?? [], customers: o.customers ?? [], invoices: o.invoices ?? [], purchases: o.purchases ?? [], sales: o.sales ?? [] });
      const { purchases: _p, sales: _s, ...rest } = o;
      return sorted({ ...blank(), ...rest, invoices: r.invoices, lines: r.lines } as Data);
    }
  } catch { /* fall through to a fresh start */ }
  return blank();
}

export function getSnapshot(): Data | null {
  if (typeof window === "undefined") return null;
  return (cache ??= load());
}
export const getServerSnapshot = (): Data | null => null;

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } }; // another tab changed it
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}

/** Changes the data, saves it, and refreshes every page showing it. Returns an error message if the browser refused to save. */
export function mutate(change: (d: Data) => void): string | null {
  const next: Data = JSON.parse(JSON.stringify(getSnapshot() ?? blank()));
  change(next);
  sorted(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return "This browser couldn't save that (its storage is full or blocked).";
  }
  cache = next;
  listeners.forEach((cb) => cb());
  return null;
}

export function reset() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch { /* ignore */ }
  clearAllFiles();
  cache = blank();
  listeners.forEach((cb) => cb());
}

// ---- uploaded files (IndexedDB) ----
type Stored = { name: string; type: string; blob: Blob };
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("mw-preview-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("files", mode);
    const req = run(t.objectStore("files"));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function saveFileLocal(file: File): Promise<string> {
  const id = crypto.randomUUID();
  await tx("readwrite", (s) => { s.put({ name: file.name, type: file.type, blob: file } satisfies Stored, id); });
  return id;
}
export async function dropFileLocal(id: string | null | undefined) {
  if (id) await tx("readwrite", (s) => { s.delete(id); }).catch(() => undefined);
}
export async function fileUrlLocal(id: string): Promise<string | null> {
  const stored = (await tx<Stored>("readonly", (s) => s.get(id) as IDBRequest<Stored>)) ?? null;
  return stored ? URL.createObjectURL(stored.blob) : null;
}
function clearAllFiles() { tx("readwrite", (s) => { s.clear(); }).catch(() => undefined); }
