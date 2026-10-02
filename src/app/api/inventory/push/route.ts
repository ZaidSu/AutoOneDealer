// Lets a computer at the dealership send AutoDash the website's inventory pages. Some websites turn away traffic from
// cloud servers like Vercel, but a normal computer (or a free scheduled GitHub job) can read them. The pages come in
// as HTML and are read by the same code the server uses itself. Needs INVENTORY_PUSH_TOKEN (set in Vercel).
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { inventoryFromHtml } from "@/lib/inventory/fetch";
import { applyInventory } from "@/lib/inventory/store";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function POST(req: NextRequest) {
  const token = process.env.INVENTORY_PUSH_TOKEN ?? "";
  if (token.length < 24) return NextResponse.json({ ok: false, error: "INVENTORY_PUSH_TOKEN isn't set in Vercel (it needs to be at least 24 characters)." }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !same(given, token)) return NextResponse.json({ ok: false, error: "Wrong token." }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > 4_000_000) return NextResponse.json({ ok: false, error: "Too much data." }, { status: 413 });

  let body: { pages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "That wasn't valid JSON." }, { status: 400 }); }
  const pages = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === "string" && p.length > 500 && p.length < 1_500_000).slice(0, 30) : [];
  if (pages.length === 0) return NextResponse.json({ ok: false, error: "No pages were sent." }, { status: 400 });
  try {
    const state = await applyInventory(inventoryFromHtml(pages));
    return NextResponse.json({ ok: state.ok, count: state.count, complete: state.complete, added: state.added, sold: state.sold, error: state.error });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Couldn't read the pages." }, { status: 422 });
  }
}
