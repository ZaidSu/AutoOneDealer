// Read-only Gmail access for the connected dealership inbox. Server-only.
import { createHash } from "node:crypto";
import { explainGoogleError, GoogleError, refreshAccessToken } from "@/lib/auth/google";
import { getGmailConnection } from "@/lib/gmail/connection";
import { parseLead, type ParsedLead } from "@/lib/parsers/leads";
import { htmlToText } from "@/lib/parsers/html";

// Short-lived access tokens cached per warm server instance, keyed by a hash of the refresh token.
const tokenCache = new Map<string, { token: string; expires: number }>();

async function accessToken(refreshToken: string): Promise<string> {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const fresh = await refreshAccessToken(refreshToken);
  tokenCache.set(key, { token: fresh.access_token, expires: Date.now() + (fresh.expires_in ?? 3600) * 1000 });
  return fresh.access_token;
}

// ---- Pacing ----
// Gmail allows ~250 quota units/second per mailbox (reading one email costs 5). Requests are split into two lanes
// on each server instance so a big background import can never make a person wait:
//   interactive (pages someone is looking at): up to 20 calls/second
//   background (lead import/sync):             up to 12 calls/second
// Together that stays under Google's limit. When Google says "slow down", the background lane pauses longer.
type Lane = "interactive" | "background";
const LANES: Record<Lane, { rate: number; tokens: number; last: number; pausedUntil: number }> = {
  interactive: { rate: 20, tokens: 20, last: Date.now(), pausedUntil: 0 },
  background: { rate: 12, tokens: 12, last: Date.now(), pausedUntil: 0 },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function slowDown(lane: Lane, ms: number) {
  const until = Date.now() + ms;
  LANES.background.pausedUntil = Math.max(LANES.background.pausedUntil, until + (lane === "interactive" ? ms : 0));
  if (lane === "interactive") LANES.interactive.pausedUntil = Math.max(LANES.interactive.pausedUntil, until);
}

async function takeTurn(lane: Lane): Promise<void> {
  const bucket = LANES[lane];
  for (;;) {
    const now = Date.now();
    if (now < bucket.pausedUntil) {
      await sleep(bucket.pausedUntil - now);
      continue;
    }
    bucket.tokens = Math.min(bucket.rate, bucket.tokens + ((now - bucket.last) / 1000) * bucket.rate);
    bucket.last = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    await sleep(((1 - bucket.tokens) / bucket.rate) * 1000);
  }
}

export class GmailClient {
  constructor(private token: string, readonly mailbox: string, private lane: Lane = "interactive") {}

  private async get<T>(path: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
    }
    // Gmail allows about 250 "quota units" per second per mailbox (reading one email costs 5).
    // Requests are paced below that, and rate-limit answers are retried with growing waits.
    for (let attempt = 0; ; attempt++) {
      await takeTurn(this.lane);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
      if (response.ok) return response.json() as Promise<T>;
      const body = await response.json().catch(() => ({}));
      const reason: string = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
      const rateLimited = response.status === 429 || /rateLimitExceeded|userRateLimitExceeded/i.test(reason);
      const retryable = rateLimited || response.status >= 500 || /backendError/i.test(reason);
      if (retryable && attempt < (this.lane === "interactive" ? 2 : 6)) {
        const retryAfter = Number(response.headers.get("retry-after")) * 1000;
        const wait = retryAfter > 0 ? retryAfter : Math.min(8000, 500 * 2 ** attempt) + Math.random() * 400;
        if (rateLimited) slowDown(this.lane, wait);
        await sleep(wait);
        continue;
      }
      throw new GoogleError("gmail", `${response.status}${reason ? `:${reason}` : ""}`);
    }
  }

  async listIds(q: string, max = 25): Promise<string[]> {
    return (await this.listPage(q, max)).ids;
  }

  async listPage(q: string, max = 25, pageToken?: string): Promise<{ ids: string[]; next: string | null }> {
    const data = await this.get<{ messages?: { id: string }[]; nextPageToken?: string }>("messages", { q, maxResults: max, pageToken });
    return { ids: (data.messages ?? []).map((m) => m.id), next: data.nextPageToken ?? null };
  }

  /** Counts matching messages (up to `cap`) without downloading them. */
  async count(q: string, cap = 500): Promise<number> {
    let total = 0;
    let token: string | undefined;
    do {
      const page = await this.listPage(q, Math.min(500, cap - total), token);
      total += page.ids.length;
      token = page.next ?? undefined;
    } while (token && total < cap);
    return total;
  }

  async inboxUnread(): Promise<number> {
    const label = await this.get<{ messagesUnread?: number }>("labels/INBOX");
    return label.messagesUnread ?? 0;
  }

  async summary(id: string): Promise<MessageSummary> {
    const m = await this.get<RawMessage>(`messages/${encodeURIComponent(id)}`, {
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    return toSummary(m);
  }

  async full(id: string): Promise<FullMessage> {
    const m = await this.get<RawMessage>(`messages/${encodeURIComponent(id)}`, { format: "full" });
    const bodies = { text: "", html: "" };
    collectBodies(m.payload, bodies);
    return { ...toSummary(m), text: bodies.text, html: bodies.html };
  }

  gmailLink(id: string) {
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(this.mailbox)}#all/${id}`;
  }
}

type RawPart = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: RawPart[]; headers?: { name: string; value: string }[] };
type RawMessage = { id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: RawPart };

export type MessageSummary = {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  unread: boolean;
};
export type FullMessage = MessageSummary & { text: string; html: string };

function toSummary(m: RawMessage): MessageSummary {
  const headers = Object.fromEntries((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const from = headers.from ?? "";
  return {
    id: m.id,
    threadId: m.threadId,
    from,
    fromName: from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || from,
    subject: headers.subject || "(No subject)",
    snippet: decode(m.snippet ?? ""),
    receivedAt: Number(m.internalDate ?? 0),
    unread: (m.labelIds ?? []).includes("UNREAD"),
  };
}

function decode(value: string) {
  return value.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function collectBodies(part: RawPart | undefined, out: { text: string; html: string }) {
  if (!part) return;
  const data = part.body?.data;
  if (data && !part.filename) {
    const content = Buffer.from(data, "base64url").toString("utf8");
    if (part.mimeType === "text/plain" && !out.text) out.text = content;
    if (part.mimeType === "text/html" && !out.html) out.html = content;
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

/** Readable text for display. HTML is converted to text; it is never rendered. */
export function readableBody(message: FullMessage): string {
  const fromHtml = message.html ? htmlToText(message.html) : "";
  // Some senders (like CarsForSale) leave details out of the plain-text part, so prefer the longer version.
  const text = message.text.trim();
  return (fromHtml.length > text.length ? fromHtml : text).slice(0, 20000);
}

export type GmailResult<T> = { status: "not_connected" } | { status: "error"; message: string; code: string } | { status: "ok"; data: T; gmail: GmailClient };

/** Runs `work` with the connected inbox, turning connection problems into states the page can explain. */
export async function withGmail<T>(
  work: (gmail: GmailClient) => Promise<T>,
  // Pass a connection loaded earlier when running outside the request (e.g. background sync).
  preloaded?: Awaited<ReturnType<typeof getGmailConnection>>,
  lane: Lane = "interactive",
): Promise<GmailResult<T>> {
  const connection = preloaded === undefined ? await getGmailConnection() : preloaded;
  if (!connection) return { status: "not_connected" };
  try {
    const gmail = new GmailClient(await accessToken(connection.refreshToken), connection.mailbox, lane);
    return { status: "ok", data: await work(gmail), gmail };
  } catch (error) {
    const explained = explainGoogleError(error);
    console.error("Gmail read failed:", explained.code);
    return { status: "error", ...explained };
  }
}

/** Runs async work over items with limited parallelism to stay polite to the Gmail API. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// ---- Lead queries ----
// Dealership rule: "Loan App" in the subject = credit application; "Lead" in the subject = lead. Any sender.

const NOT_OURS = "-in:sent -in:drafts";
export const LEAD_QUERIES = {
  all: `(subject:lead OR subject:"loan app") ${NOT_OURS}`,
  application: `subject:"loan app" ${NOT_OURS}`,
  inquiry: `subject:lead -subject:"loan app" ${NOT_OURS}`,
} as const;
export type LeadFilter = keyof typeof LEAD_QUERIES;

export type Lead = ParsedLead & { messageId: string; receivedAt: number; subject: string; gmailUrl: string };

export async function fetchLeads(
  gmail: GmailClient,
  { filter = "all", extra = "", max = 40, pageToken }: { filter?: LeadFilter; extra?: string; max?: number; pageToken?: string } = {},
): Promise<{ leads: Lead[]; next: string | null; skipped: number }> {
  let skipped = 0;
  const page = await gmail.listPage(`${LEAD_QUERIES[filter]} ${extra}`.trim(), max, pageToken);
  const results = await mapLimit(page.ids, 5, (id) =>
    readLead(gmail, id).catch((error) => {
      // One unreadable email shouldn't break the page; it isn't cached, so it's retried next time.
      console.error("Skipped a lead email:", error instanceof Error ? error.message : "unknown");
      skipped++;
      return null;
    }),
  );
  return { leads: results.filter((l): l is Lead => l !== null), next: page.next, skipped };
}

// Emails never change, so parsed leads are remembered per message on a warm server instance.
// Holds only what the pages display; cleared whenever the server restarts.
const leadCache = new Map<string, Lead | null>();
const LEAD_CACHE_LIMIT = 3000;

export async function readLead(gmail: GmailClient, id: string): Promise<Lead | null> {
  const cacheKey = `${gmail.mailbox}:${id}`;
  if (leadCache.has(cacheKey)) return leadCache.get(cacheKey)!;
  const m = await gmail.full(id);
  const parsed = parseLead({ from: m.from, subject: m.subject, text: m.text, html: m.html, mailbox: gmail.mailbox });
  const lead = parsed && { ...parsed, messageId: m.id, receivedAt: m.receivedAt, subject: m.subject, gmailUrl: gmail.gmailLink(m.id) };
  if (leadCache.size >= LEAD_CACHE_LIMIT) leadCache.delete(leadCache.keys().next().value!);
  leadCache.set(cacheKey, lead);
  return lead;
}

/** Reads several pages of leads (newest first) up to `limit` emails. */
export async function fetchManyLeads(gmail: GmailClient, { extra = "", limit = 150 }: { extra?: string; limit?: number } = {}) {
  const leads: Lead[] = [];
  let token: string | undefined;
  let scanned = 0;
  let skipped = 0;
  do {
    const page = await fetchLeads(gmail, { extra, max: Math.min(100, limit - scanned), pageToken: token });
    leads.push(...page.leads);
    skipped += page.skipped;
    scanned += Math.min(100, limit - scanned);
    token = page.next ?? undefined;
  } while (token && scanned < limit);
  return { leads, more: Boolean(token), skipped };
}

/** Gmail search accepts Unix seconds in after:, which lets "today" follow the dealership's time zone. */
export function startOfDealershipDay(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0) % 24;
  const sinceMidnight = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return Math.floor((now.getTime() - sinceMidnight) / 1000);
}
