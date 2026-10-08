import type { Metadata } from "next";
import { BarList, Columns, Panel, Stat } from "@/components/analytics/Charts";
import { AddSale, BackOnLot, CheckNowButton, ImportText, MarkSold, RemoveCar, RestoreCar } from "@/components/inventory/InventoryActions";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { can } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { aiViewOfInventory, getPageStats, getSyncState, inventoryStats, listCars, seedInventoryOnce } from "@/lib/inventory/store";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Chicago";
const usd = (n: number | null | undefined) => (n == null ? "n/a" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ }) : "");
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} hours ago` : `${Math.round(min / 1440)} days ago`;
};

export default async function InventoryPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const staff = await requirePageStaff();
  const dev = can.useDeveloperTools(staff.role); // website-reading status and the paste box are for the developer only
  const q = String((await searchParams)?.q ?? "").trim().toLowerCase().slice(0, 60);
  const header = <PageHeader title="Inventory" description="The cars on your website, what sold, and what sells best. The AI reads this to answer “is it still available?”." action={<CheckNowButton />} />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Inventory" /></>;
  await seedInventoryOnce().catch(() => undefined); // the first time, loads the cars from the website text sent on Oct 2
  const [sync, stats, lot, sold, deleted, aiView, pageStats] = await fresh("Inventory", () => Promise.all([getSyncState(), inventoryStats(TZ), listCars("available"), listCars("sold", 100), listCars("deleted", 100), aiViewOfInventory(), dev ? getPageStats() : Promise.resolve({})]));

  const shown = q ? lot.filter((c) => `${c.title} ${c.vin ?? ""} ${c.make ?? ""} ${c.model ?? ""}`.toLowerCase().includes(q)) : lot;
  const best = stats.byMonth.length ? [...stats.byMonth].sort((a, b) => b.n - a.n)[0] : null;
  const bestMake = stats.byMake[0] ?? null;

  return (
    <div className="max-w-6xl">
      {header}

      {dev && <>
      <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-[15px] ${sync?.ok ? "bg-go-soft text-go" : "border border-lane/40 bg-[#fdf6e3]"}`}>
        {!sync ? "Not read from the website yet. AutoDash reads it once a day at 7 pm, or click Check website now."
          : sync.ok ? `Checked ${ago(sync.at)}: ${sync.count} cars on the website${sync.via === "helper" ? " (read through a helper service, because the website doesn't answer AutoDash directly)" : sync.via === "pushed" ? " (sent by the dealership computer)" : sync.via === "pasted" ? " (pasted from the website, trusted for a day)" : ""}${sync.complete ? "" : `. Only part of the website could be read${sync.pagesExpected ? ` (${sync.pagesRead ?? 0} of ${sync.pagesExpected} pages)` : ""}, so nothing is being marked sold. The next full read is at 7 pm tonight (or click Check website now)`}.`
          : `The last check ${ago(sync.at)} failed: ${sync.error}. The AI says a salesperson will confirm availability until this is fixed.`}
      </p>

      <p role="status" className={`-mt-3 mb-6 rounded-xl px-4 py-3 text-[15px] ${aiView.ok ? "bg-go-soft text-go" : "border border-signal/30 bg-warn-soft text-ink"}`}>
        <span className="font-semibold">What the AI sees: </span>{aiView.text}
        {aiView.noLink > 0 && ` ${aiView.noLink} car${aiView.noLink === 1 ? " has" : "s have"} no link yet (they came from pasted text); they're replaced by the real ones after the next full read of the website.`}
      </p>

      <PageReads stats={pageStats} />
      <div className="mb-6"><ImportText /></div>
      </>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat value={stats.available} label="On the lot" color="#1f7a4d" />
        <Stat value={stats.sold} label="Sold" color="#c8102e" sub={stats.soldUnknown ? `${stats.sold - stats.soldUnknown} with a sale date, ${stats.soldUnknown} sold before AutoDash was tracking` : stats.soldTotal ? `${usd(stats.soldTotal)} total` : "since AutoDash started tracking"} />
        <Stat value={usd(stats.avgSold)} label="Average sold price" />
      </div>

      {stats.soldUnknown > 0 && (
        <p className="mt-4 text-sm text-muted">{stats.soldUnknown} car{stats.soldUnknown === 1 ? " was" : "s were"} already marked Sold on the website when AutoDash first saw {stats.soldUnknown === 1 ? "it" : "them"}, so there's no sale date or price. They're listed under Sold but left out of the charts below. Click Not sold to put one back on the lot, or add its real sale with Add a past sale.</p>
      )}

      {stats.sold - stats.soldUnknown === 0 && <p className="mt-6 panel p-5 text-muted">Sales charts fill in once cars sell (or add past sales under Sold below). Until then, here is what is on the lot.</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {stats.sold - stats.soldUnknown > 0 && <>
        <Panel title="Sales by month" note={best ? `Best month so far: ${monthLabel(best.month)} with ${best.n} sold.` : "Fills in as cars sell. Add past sales below to include earlier months."}>
          <Columns items={stats.byMonth.map((m) => ({ label: monthLabel(m.month), value: m.n }))} emptyText="No sales recorded yet." color="#c8102e" highlightLast />
        </Panel>
        <Panel title="Best-selling makes" note={bestMake ? `${bestMake.make} sells the most (${bestMake.n}${bestMake.avg ? `, about ${usd(bestMake.avg)} each` : ""}).` : "No sales recorded yet."}>
          <BarList items={stats.byMake.map((m) => ({ label: m.make, value: m.n, note: m.avg ? `avg ${usd(m.avg)}` : undefined }))} emptyText="No sales recorded yet." />
        </Panel>
        <Panel title="What price range sells" note="Cars sold, grouped by what they sold for.">
          <BarList items={stats.byPrice.map((p) => ({ label: p.label, value: p.n }))} emptyText="No sales recorded yet." />
        </Panel>
        </>}
        <Panel title="What's on the lot now" note="Cars on your website, by make.">
          <BarList items={stats.lotByMake.map((m) => ({ label: m.make, value: m.n }))} emptyText="Nothing read from the website yet." highlightFirst={false} />
        </Panel>
      </div>

      <section aria-labelledby="lot" className="mt-10">
        <h2 id="lot" className="mb-1 text-lg font-semibold">On the lot <span className="text-muted">{q ? `${shown.length} of ${lot.length}` : lot.length}</span></h2>
        <p className="mb-3 text-sm text-muted">Copied from your website. When a car disappears from the website it moves to Sold on its own. Sold by hand sooner? Use Mark sold. A car that isn't yours (it's on the website for someone else)? Use Delete.</p>
        <form method="get" className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search by make, model, year or VIN" className="h-10 w-72 max-w-full rounded-md border border-line bg-white px-3 text-[15px]" />
          <button className="btn" type="submit">Search</button>
          {q && <a href="/inventory" className="btn">Clear</a>}
        </form>
        {shown.length === 0 ? <p className="panel p-5 text-muted">{q ? "No cars match that search." : "No cars yet."}</p> : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted"><tr><th className="px-4 py-2.5 font-semibold">Car</th><th className="px-4 py-2.5 font-semibold">Price</th><th className="px-4 py-2.5 font-semibold">Miles</th><th className="px-4 py-2.5 font-semibold">VIN</th><th className="px-4 py-2.5 font-semibold">First seen</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium">
                      <span className="flex items-center gap-3">
                        {c.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.imageUrl} alt="" width={64} height={48} loading="lazy" className="h-12 w-16 shrink-0 rounded-md bg-line object-cover" />
                        )}
                        <span>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.title}</a> : c.title}{c.images.length > 1 && <span className="font-normal text-muted"> · {c.images.length} photos</span>}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{usd(c.price)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{c.mileage ? c.mileage.toLocaleString("en-US") : ""}</td>
                    <td className="px-4 py-2.5 font-mono text-sm text-muted" title={c.vin ?? undefined}>{c.vin ? <><span>{c.vin.slice(0, -6)}</span><span className="font-semibold text-ink">{c.vin.slice(-6)}</span></> : <span title="Read from the car's own page a few cars at a time">not read yet</span>}</td>
                    <td className="px-4 py-2.5 text-muted">{day(c.firstSeen)}</td>
                    <td className="px-4 py-2.5 text-right"><span className="inline-flex flex-wrap items-center justify-end gap-2"><MarkSold id={c.id} price={c.price} /><RemoveCar id={c.id} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="sold" className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="sold" className="text-lg font-semibold">Sold <span className="text-muted">{stats.sold}</span></h2>
            <p className="text-sm text-muted">&ldquo;Left the website&rdquo; is AutoDash noticing a car disappeared (a car taken down for another reason would show here too). Fix any by hand.</p>
          </div>
          <AddSale />
        </div>
        {sold.length === 0 ? <p className="panel p-5 text-muted">No sales recorded yet. Once a car leaves your website it shows up here.</p> : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted"><tr><th className="px-4 py-2.5 font-semibold">Car</th><th className="px-4 py-2.5 font-semibold">Sold for</th><th className="px-4 py-2.5 font-semibold">Date</th><th className="px-4 py-2.5 font-semibold">How we know</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {sold.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium">{c.title}</td>
                    <td className="px-4 py-2.5 tabular-nums">{usd(c.soldPrice ?? c.price)}</td>
                    <td className="px-4 py-2.5 text-muted">{c.soldAt ? day(c.soldAt) : "date unknown"}</td>
                    <td className="px-4 py-2.5 text-muted">{c.soldBy ? `${c.soldNote ?? "By hand"} (${c.soldBy})` : c.soldNote}</td>
                    <td className="px-4 py-2.5 text-right"><span className="inline-flex gap-2"><BackOnLot id={c.id} /><RemoveCar id={c.id} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {deleted.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-lg font-semibold">Deleted cars <span className="text-muted">{deleted.length}</span></summary>
          <p className="mb-3 mt-1 text-sm text-muted">Cars you deleted (not yours). They don&apos;t count anywhere and the AI never offers them. Restore one if it was a mistake.</p>
          <ul className="panel divide-y divide-line">
            {deleted.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="font-medium">{c.title}<span className="text-muted">{c.price ? ` · ${usd(c.price)}` : ""}{c.mileage ? ` · ${c.mileage.toLocaleString("en-US")} miles` : ""}</span></span>
                <RestoreCar id={c.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Developer only: for each website page, how often it was read and what the website said when it wasn't. */
function PageReads({ stats }: { stats: Record<string, { ok: number; fail: number; lastOkAt: number | null; lastFailAt: number | null; lastError: string | null; routes: { direct: [number, number]; helper: [number, number] } }> }) {
  const rows = Object.entries(stats).map(([n, s]) => ({ n: Number(n), ...s })).sort((a, b) => a.n - b.n);
  if (!rows.length) return <p className="-mt-3 mb-6 text-sm text-muted">Page-by-page results of reading the website appear here after the next check.</p>;
  return (
    <details className="mb-6 rounded-xl border border-line bg-white p-4 text-sm" open={rows.some((r) => r.fail > 0)}>
      <summary className="cursor-pointer font-semibold">Which website pages are read, and which fail (only you see this)</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="text-muted"><tr><th className="py-1 pr-3 font-medium">Page</th><th className="pr-3 font-medium">Worked</th><th className="pr-3 font-medium">Failed</th><th className="pr-3 font-medium">Direct (ok / failed)</th><th className="pr-3 font-medium">Helper (ok / failed)</th><th className="font-medium">Last error</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.n} className={r.fail > r.ok ? "bg-warn-soft" : ""}>
                <td className="py-1.5 pr-3 font-semibold">{r.n}</td><td className="pr-3 tabular-nums">{r.ok}</td><td className="pr-3 tabular-nums">{r.fail}</td>
                <td className="pr-3 tabular-nums">{r.routes.direct[0]} / {r.routes.direct[1]}</td><td className="pr-3 tabular-nums">{r.routes.helper[0]} / {r.routes.helper[1]}</td>
                <td className="text-muted">{r.lastError ?? "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-muted">Each full read (7 pm, or Check website now) tries every page. A page that fails far more than the others is the one the website turns away.</p>
    </details>
  );
}
