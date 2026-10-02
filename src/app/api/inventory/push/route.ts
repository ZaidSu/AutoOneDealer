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

// The browser snippet (tools/browser-snippet.js) runs on the dealership's own website, so that website is allowed to call this.
// It still needs the secret token.
const ORIGINS = ["https://www.autoonemotorstx.com", "https://autoonemotorstx.com"];
const corsHeaders = (req: NextRequest): Record<string, string> => {
  const origin = req.headers.get("origin") ?? "";
  return ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } : {};
};
const reply = (req: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: corsHeaders(req) });

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const token = process.env.INVENTORY_PUSH_TOKEN ?? "";
  if (token.length < 24) return reply(req, { ok: false, error: "INVENTORY_PUSH_TOKEN isn't set in Vercel (it needs to be at least 24 characters)." }, 503);
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !same(given, token)) return reply(req, { ok: false, error: "Wrong token." }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > 4_000_000) return reply(req, { ok: false, error: "Too much data." }, 413);

  let body: { pages?: unknown };
  try { body = await req.json(); } catch { return reply(req, { ok: false, error: "That wasn't valid JSON." }, 400); }
  const pages = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === "string" && p.length > 500 && p.length < 1_500_000).slice(0, 30) : [];
  if (pages.length === 0) return reply(req, { ok: false, error: "No pages were sent." }, 400);
  try {
    const state = await applyInventory(inventoryFromHtml(pages));
    return reply(req, { ok: state.ok, count: state.count, complete: state.complete, added: state.added, sold: state.sold, error: state.error });
  } catch (error) {
    return reply(req, { ok: false, error: error instanceof Error ? error.message : "Couldn't read the pages." }, 422);
  }
}
