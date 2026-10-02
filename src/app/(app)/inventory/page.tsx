import type { Metadata } from "next";
import { BarList, Columns, Panel, Stat } from "@/components/analytics/Charts";
import { AddSale, BackOnLot, CheckNowButton, MarkSold } from "@/components/inventory/InventoryActions";
import DbNotice from "@/components/ui/DbNotice";
import PageHeader from "@/components/ui/PageHeader";
import { requirePageStaff } from "@/lib/auth/guard";
import { dbState, fresh } from "@/lib/db";
import { getSyncState, inventoryStats, listCars } from "@/lib/inventory/store";

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

export default async function InventoryPage() {
  await requirePageStaff();
  const header = <PageHeader title="Inventory" description="The cars on your website, what sold, and what sells best. The AI reads this to answer “is it still available?”." action={<CheckNowButton />} />;
  const state = await dbState();
  if (state !== "ready") return <>{header}<DbNotice state={state} what="Inventory" /></>;
  const [sync, stats, lot, sold] = await fresh("Inventory", () => Promise.all([getSyncState(), inventoryStats(TZ), listCars("available"), listCars("sold", 100)]));

  const best = stats.byMonth.length ? [...stats.byMonth].sort((a, b) => b.n - a.n)[0] : null;
  const bestMake = stats.byMake[0] ?? null;

  return (
    <div className="max-w-6xl">
      {header}

      <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-[15px] ${sync?.ok ? "bg-go-soft text-go" : "border border-lane/40 bg-[#fdf6e3]"}`}>
        {!sync ? "Not read from the website yet. The timer does it every 5 minutes, or click Check website now."
          : sync.ok ? `Checked ${ago(sync.at)}: ${sync.count} cars on the website${sync.via === "helper" ? " (read through a helper service, because the website doesn't answer AutoDash directly)" : sync.via === "pushed" ? " (sent by the dealership computer)" : ""}${sync.complete ? "" : ". Only part of the website could be read, so nothing is being marked sold"}.`
          : `The last check ${ago(sync.at)} failed: ${sync.error}. The AI says a salesperson will confirm availability until this is fixed.`}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat value={stats.available} label="On the lot" color="#1f7a4d" />
        <Stat value={stats.sold} label="Sold" color="#c8102e" sub={stats.soldTotal ? `${usd(stats.soldTotal)} total` : "since AutoDash started tracking"} />
        <Stat value={usd(stats.avgSold)} label="Average sold price" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Sales by month" note={best ? `Best month so far: ${monthLabel(best.month)} with ${best.n} sold.` : "Fills in as cars sell. Add past sales below to include earlier months."}>
          <Columns items={stats.byMonth.map((m) => ({ label: monthLabel(m.month), value: m.n }))} emptyText="No sales recorded yet." color="#c8102e" highlightLast />
        </Panel>
        <Panel title="Best-selling makes" note={bestMake ? `${bestMake.make} sells the most (${bestMake.n}${bestMake.avg ? `, about ${usd(bestMake.avg)} each` : ""}).` : "No sales recorded yet."}>
          <BarList items={stats.byMake.map((m) => ({ label: m.make, value: m.n, note: m.avg ? `avg ${usd(m.avg)}` : undefined }))} emptyText="No sales recorded yet." />
        </Panel>
        <Panel title="What price range sells" note="Cars sold, grouped by what they sold for.">
          <BarList items={stats.byPrice.map((p) => ({ label: p.label, value: p.n }))} emptyText="No sales recorded yet." />
        </Panel>
        <Panel title="What's on the lot now" note="Cars on your website, by make.">
          <BarList items={stats.lotByMake.map((m) => ({ label: m.make, value: m.n }))} emptyText="Nothing read from the website yet." highlightFirst={false} />
        </Panel>
      </div>

      <section aria-labelledby="lot" className="mt-10">
        <h2 id="lot" className="mb-1 text-lg font-semibold">On the lot <span className="text-muted">{lot.length}</span></h2>
        <p className="mb-3 text-sm text-muted">Copied from your website. When a car disappears from the website it moves to Sold on its own. Sold by hand sooner? Use Mark sold.</p>
        {lot.length === 0 ? <p className="panel p-5 text-muted">No cars yet.</p> : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted"><tr><th className="px-4 py-2.5 font-semibold">Car</th><th className="px-4 py-2.5 font-semibold">Price</th><th className="px-4 py-2.5 font-semibold">Miles</th><th className="px-4 py-2.5 font-semibold">First seen</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {lot.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium">{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.title}</a> : c.title}</td>
                    <td className="px-4 py-2.5 tabular-nums">{usd(c.price)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{c.mileage ? c.mileage.toLocaleString("en-US") : ""}</td>
                    <td className="px-4 py-2.5 text-muted">{day(c.firstSeen)}</td>
                    <td className="px-4 py-2.5 text-right"><MarkSold id={c.id} price={c.price} /></td>
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
                    <td className="px-4 py-2.5 text-muted">{day(c.soldAt)}</td>
                    <td className="px-4 py-2.5 text-muted">{c.soldBy ? `${c.soldNote ?? "By hand"} (${c.soldBy})` : c.soldNote}</td>
                    <td className="px-4 py-2.5 text-right"><BackOnLot id={c.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
