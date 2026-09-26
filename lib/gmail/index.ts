// Read-only Gmail access for the connected dealership inbox. Server-only.
import { createHash } from "node:crypto";
import { refreshAccessToken } from "@/lib/auth/google";
import { getGmailConnection } from "@/lib/auth/session";
import { classifyCfs, parseFinanceApplication, parseWebsiteLead, type FinanceApplication, type WebsiteLead } from "@/lib/parsers/carsforsale";
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

export class GmailClient {
  constructor(private token: string, readonly mailbox: string) {}

  private async get<T>(path: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
    }
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "gmail_denied" : `gmail_${response.status}`);
    return response.json() as Promise<T>;
  }

  async listIds(q: string, max = 25): Promise<string[]> {
    const data = await this.get<{ messages?: { id: string }[] }>("messages", { q, maxResults: max });
    return (data.messages ?? []).map((m) => m.id);
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

export type GmailResult<T> = { status: "not_connected" } | { status: "error" } | { status: "ok"; data: T; gmail: GmailClient };

/** Runs `work` with the connected inbox, turning connection problems into states the page can explain. */
export async function withGmail<T>(work: (gmail: GmailClient) => Promise<T>): Promise<GmailResult<T>> {
  const connection = await getGmailConnection();
  if (!connection) return { status: "not_connected" };
  try {
    const gmail = new GmailClient(await accessToken(connection.refreshToken), connection.mailbox);
    return { status: "ok", data: await work(gmail), gmail };
  } catch (error) {
    console.error("Gmail read failed:", error instanceof Error ? error.message : "unknown");
    return { status: "error" };
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

// ---- CarsForSale lead queries ----

export const CFS_APPLICATIONS_QUERY = 'from:carsforsalemail.com subject:"Loan App"';
export const CFS_LEADS_QUERY = 'from:carsforsalemail.com subject:"New Lead"';

export type CreditApplication = FinanceApplication & { messageId: string; receivedAt: number; gmailUrl: string };
export type WebLead = WebsiteLead & { messageId: string; receivedAt: number; gmailUrl: string };

export async function creditApplications(gmail: GmailClient, window = "newer_than:180d", max = 50): Promise<CreditApplication[]> {
  const ids = await gmail.listIds(`${CFS_APPLICATIONS_QUERY} ${window}`, max);
  const messages = await mapLimit(ids, 8, (id) => gmail.full(id));
  return messages
    .filter((m) => classifyCfs(m.from, m.subject) === "finance_application")
    .map((m) => ({ ...parseFinanceApplication(m.html || m.text), messageId: m.id, receivedAt: m.receivedAt, gmailUrl: gmail.gmailLink(m.id) }));
}

export async function websiteLeads(gmail: GmailClient, window = "newer_than:180d", max = 50): Promise<WebLead[]> {
  const ids = await gmail.listIds(`${CFS_LEADS_QUERY} ${window}`, max);
  const messages = await mapLimit(ids, 8, (id) => gmail.full(id));
  return messages
    .filter((m) => classifyCfs(m.from, m.subject) === "website_lead")
    .map((m) => ({ ...parseWebsiteLead(m.html || m.text), messageId: m.id, receivedAt: m.receivedAt, gmailUrl: gmail.gmailLink(m.id) }));
}
