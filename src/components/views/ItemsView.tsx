import ItemRow from "@/components/forms/ItemRow";
import ActionForm from "@/components/ui/ActionForm";
import Empty from "@/components/ui/Empty";
import PageHeader from "@/components/ui/PageHeader";
import type { ViewProps } from "./types";
import { itemStats, money, num } from "@/lib/calc";

export default function ItemsView({ data, params, editable, act }: ViewProps) {
  const { items, invoices, lines } = data;
  const q = String(params.q ?? "").trim().toLowerCase();
  const stats = itemStats(items, invoices, lines);
  const shown = items.filter((i) => !q || [i.name, i.upc, i.sku, i.category].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <>
      <PageHeader title="Items" description="Everything you sell. Items are added for you when you save an invoice, and you can add or fix them here." />

      {editable && (
        <section className="card">
          <h2 className="mb-3">Add an item</h2>
          <ActionForm action={act.addItemAction} submitLabel="Add item">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field sm:col-span-2">Name<input name="name" required className="input" placeholder="iPad 10th Gen 64GB" /></label>
              <label className="field">Last 4 of the UPC<input name="upc" className="input" inputMode="numeric" /></label>
              <label className="field">Category<input name="category" className="input" placeholder="Tablets" /></label>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2>{items.length} {items.length === 1 ? "item" : "items"}</h2>
          <form method="get" className="w-full sm:w-64"><input name="q" defaultValue={q} placeholder="Search name or last 4…" className="input !h-10" aria-label="Search items" /></form>
        </div>
        {shown.length === 0 ? <Empty title={items.length ? "No items match your search" : "No items yet"}>{items.length ? "Try a different word." : editable ? "Add one above, or drop in an invoice and they appear on their own." : "Nothing has been added yet."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Item</th><th>Last 4 UPC</th><th>Category</th><th className="r">Sold</th><th className="r">Avg selling price</th><th className="r">Avg buying price</th><th className="r">Profit</th>{editable && <th />}</tr></thead>
              <tbody>
                {shown.map((i) => {
                  const s = stats[i.id];
                  return editable
                    ? <ItemRow key={i.id} item={i} used={s.invoices > 0} update={act.updateItemAction} remove={act.deleteItemAction}
                        figures={<><td className="r">{num(s.sold)}</td><td className="r">{s.sold ? money(s.avgPrice) : "\u2014"}</td><td className="r">{s.sold ? money(s.avgCost) : "\u2014"}</td><td className={`r font-bold ${s.profit < 0 ? "text-bad" : ""}`}>{s.sold ? money(s.profit) : "\u2014"}</td></>} />
                    : (
                      <tr key={i.id}>
                        <td>{i.name}</td><td>{i.upc || "\u2014"}</td><td>{i.category || "\u2014"}</td>
                        <td className="r">{num(s.sold)}</td><td className="r">{s.sold ? money(s.avgPrice) : "\u2014"}</td><td className="r">{s.sold ? money(s.avgCost) : "\u2014"}</td><td className="r">{s.sold ? money(s.profit) : "\u2014"}</td>
                      </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
