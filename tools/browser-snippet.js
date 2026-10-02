// Run this INSIDE the dealership website, in your normal browser. It's the one way that always works, because the page
// is already open in a real browser and the website lets its own pages read each other.
//
// 1. Open https://www.autoonemotorstx.com/cars-for-sale in Chrome.
// 2. Press F12, click the Console tab, paste ALL of this, press Enter.
// 3. Type the secret token when it asks (the INVENTORY_PUSH_TOKEN you saved in Vercel).
(async () => {
  const AUTODASH = "https://auto-one-dealer.vercel.app";
  const token = (prompt("Paste your AutoDash inventory token (INVENTORY_PUSH_TOKEN):") || "").trim();
  if (!token) return console.log("Cancelled: no token.");
  const slim = (html) => html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/\s{2,}/g, " ");
  const base = location.origin + "/cars-for-sale";
  const url = (n) => n <= 1 ? base : `${base}?PageNumber=${n}&Sort=MakeAsc&StockNumber=&Condition=&BodyStyle=&Make=&MaxPrice=&Mileage=&SoldStatus=AllVehicles&StockNumber=`;
  const getPage = async (n) => { const r = await fetch(url(n), { credentials: "same-origin" }); if (!r.ok) throw new Error(`page ${n} answered ${r.status}`); return r.text(); };
  const pageCount = (html) => {
    const text = html.replace(/<[^>]+>/g, " ");
    const explicit = Number(/Page\s+\d+\s+of\s+(\d+)/i.exec(text)?.[1]);
    if (explicit) return explicit;
    const range = /Results\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i.exec(text);
    return range ? Math.ceil(Number(range[3]) / (Number(range[2]) - Number(range[1]) + 1)) : 1;
  };
  try {
    const first = await getPage(1);
    if (!/details\//.test(first)) throw new Error("the first page had no cars in it");
    const pages = pageCount(first);
    const htmls = [slim(first)];
    for (let n = 2; n <= Math.min(pages, 30); n++) {
      await new Promise((r) => setTimeout(r, 800));
      const html = await getPage(n);
      if (!/details\//.test(html)) break;
      htmls.push(slim(html));
    }
    console.log(`The website has ${pages} pages. Read ${htmls.length}. Sending to AutoDash...`);
    const res = await fetch(`${AUTODASH}/api/inventory/push`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ pages: htmls }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(`AutoDash said: ${out.error || res.status}`);
    const msg = `Sent to AutoDash: ${out.count} cars${out.complete ? "" : " (some pages were missing)"}.`;
    console.log(msg); alert(msg);
  } catch (error) {
    const msg = `Failed: ${error && error.message ? error.message : error}`;
    console.error(msg); alert(msg);
  }
})();
