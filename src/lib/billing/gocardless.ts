// Bank payments (ACH) through GoCardless. The owner connects the dealership's bank account once on GoCardless's own
// page (a "mandate"); after that AutoDash collects each bill on its due date. Bank details never touch AutoDash.
// Needs GOCARDLESS_ACCESS_TOKEN (sandbox_... for testing, live_... for real) and GOCARDLESS_WEBHOOK_SECRET.
import { createHmac, timingSafeEqual } from "node:crypto";

export const gocardlessConfigured = () => Boolean(process.env.GOCARDLESS_ACCESS_TOKEN);
export const gocardlessSandbox = () => String(process.env.GOCARDLESS_ACCESS_TOKEN ?? "").startsWith("sandbox_");
const apiBase = () => process.env.GOCARDLESS_BASE_URL || (gocardlessSandbox() ? "https://api-sandbox.gocardless.com" : "https://api.gocardless.com");

async function gc<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
      "GoCardless-Version": "2015-07-06",
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.errors?.[0]?.message ?? data?.error?.message ?? `GoCardless error ${response.status}`;
    throw new Error(detail);
  }
  return data as T;
}

/** Step 1: a GoCardless page where the owner connects the bank account. Returns the page to send them to. */
export async function startBankSetup(baseUrl: string, email?: string): Promise<{ billingRequestId: string; url: string }> {
  const br = await gc<{ billing_requests: { id: string } }>("/billing_requests", {
    billing_requests: { mandate_request: { scheme: "ach", currency: "USD" }, metadata: { purpose: "autodash_billing" } },
  });
  const flow = await gc<{ billing_request_flows: { authorisation_url: string } }>("/billing_request_flows", {
    billing_request_flows: {
      redirect_uri: `${baseUrl}/api/billing/gocardless/return?br=${br.billing_requests.id}`,
      exit_uri: `${baseUrl}/billing?canceled=1`,
      ...(email ? { prefilled_customer: { email } } : {}),
      links: { billing_request: br.billing_requests.id },
    },
  });
  return { billingRequestId: br.billing_requests.id, url: flow.billing_request_flows.authorisation_url };
}

/** Step 2: after they finish, the bank authorization (mandate) that was created, if any. */
export async function mandateFromSetup(billingRequestId: string): Promise<string | null> {
  const br = await gc<{ billing_requests: { status: string; links?: { mandate_request_mandate?: string } } }>(`/billing_requests/${encodeURIComponent(billingRequestId)}`);
  return br.billing_requests.links?.mandate_request_mandate ?? null;
}

export async function getMandate(id: string) {
  const m = await gc<{ mandates: { id: string; status: string; next_possible_charge_date: string | null } }>(`/mandates/${encodeURIComponent(id)}`);
  return m.mandates;
}

export async function cancelMandate(id: string) {
  await gc(`/mandates/${encodeURIComponent(id)}/actions/cancel`, {});
}

/** Collects one bill from the connected bank account. chargeDate is YYYY-MM-DD, or null for the earliest possible. */
export async function collectPayment(opts: { mandateId: string; cents: number; description: string; invoiceId: number; chargeDate: string | null; attempt?: number }): Promise<{ id: string; chargeDate: string }> {
  const p = await gc<{ payments: { id: string; charge_date: string } }>("/payments", {
    payments: {
      amount: opts.cents,
      currency: "USD",
      description: opts.description.slice(0, 100),
      ...(opts.chargeDate ? { charge_date: opts.chargeDate } : {}),
      metadata: { invoice_id: String(opts.invoiceId) },
      links: { mandate: opts.mandateId },
    },
  }, `autodash-invoice-${opts.invoiceId}-${opts.attempt ?? 0}`); // a bill is never collected twice by accident; a retry after a failure gets a new key
  return { id: p.payments.id, chargeDate: p.payments.charge_date };
}

/** GoCardless signs each webhook: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function validGoCardlessSignature(rawBody: string, signature: string | null, secret = process.env.GOCARDLESS_WEBHOOK_SECRET ?? ""): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
