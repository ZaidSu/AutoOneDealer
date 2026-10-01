// Card payments through Stripe Checkout (Stripe's own payment page; card numbers never touch AutoDash).
// Needs STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET so Stripe can confirm payments even if the tab is closed.
import { createHmac, timingSafeEqual } from "node:crypto";
import { money, periodLabel, type Invoice } from "./types.ts";

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
// Secret keys start with sk_, restricted keys (limited permissions) with rk_; either kind can be test or live.
export const stripeTestMode = () => /^(sk|rk)_test_/.test(String(process.env.STRIPE_SECRET_KEY ?? ""));

async function stripe<T>(path: string, form?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe isn't set up yet (STRIPE_SECRET_KEY).");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? `Stripe error ${response.status}`);
  return data as T;
}

/** A Stripe payment page for one bill. Each line of the bill (and the tax) shows on Stripe's page too. */
export async function createCheckout(invoice: Invoice, baseUrl: string, customerEmail?: string): Promise<{ id: string; url: string }> {
  const form: Record<string, string> = {
    mode: "payment",
    success_url: `${baseUrl}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?canceled=1`,
    client_reference_id: String(invoice.id),
    "metadata[invoice_id]": String(invoice.id),
    "payment_intent_data[description]": `AutoDash bill ${invoice.number} (${periodLabel(invoice.period)})`,
    "payment_intent_data[metadata][invoice_id]": String(invoice.id),
  };
  if (customerEmail) form.customer_email = customerEmail;
  const lines = [...invoice.items.map((i) => ({ name: i.label, cents: i.cents })), ...(invoice.tax ? [{ name: "Sales tax", cents: invoice.tax }] : [])];
  lines.forEach((line, n) => {
    form[`line_items[${n}][quantity]`] = "1";
    form[`line_items[${n}][price_data][currency]`] = "usd";
    form[`line_items[${n}][price_data][unit_amount]`] = String(line.cents);
    form[`line_items[${n}][price_data][product_data][name]`] = line.name;
  });
  const session = await stripe<{ id: string; url: string }>("checkout/sessions", form);
  return { id: session.id, url: session.url };
}

export async function getCheckout(id: string) {
  return stripe<{ id: string; payment_status: string; amount_total: number; metadata?: { invoice_id?: string } }>(`checkout/sessions/${encodeURIComponent(id)}`);
}

/** Checks the "Stripe-Signature" header, so only Stripe can mark a bill paid. */
export function verifyWebhook(rawBody: string, header: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET ?? "", now = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false; // older than 5 minutes: could be replayed
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const given = Buffer.from(p.slice(3));
    return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected));
  });
}

export { money };
