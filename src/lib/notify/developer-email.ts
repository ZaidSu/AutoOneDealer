// A way to email the developer that does NOT depend on the dealership Gmail (the Gmail connection is often what broke).
// Sends through Resend (resend.com, free tier) with a plain web request. Needs RESEND_API_KEY in Vercel.
// With Resend's default sender (onboarding@resend.dev) mail can only go to the email address that owns the Resend account,
// which is exactly the developer. Set RESEND_FROM to use your own verified domain instead.
import { parseStaffAccess } from "@/lib/auth/access";

/** Who gets developer emails: DEVELOPER_ALERT_EMAIL (comma separated), otherwise everyone listed as developer in STAFF_ACCESS. */
export function developerEmails(): string[] {
  const set = String(process.env.DEVELOPER_ALERT_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  if (set.length) return [...new Set(set)];
  return [...parseStaffAccess(process.env.STAFF_ACCESS, undefined)].filter(([, role]) => role === "developer").map(([email]) => email);
}

export function developerEmailReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && developerEmails().length > 0;
}

export async function emailDeveloper(subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const to = developerEmails();
  if (!key) return { ok: false, error: "RESEND_API_KEY isn't set" };
  if (!to.length) return { ok: false, error: "No developer email (set DEVELOPER_ALERT_EMAIL)" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "AutoDash <onboarding@resend.dev>", to, subject: subject.slice(0, 150), text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, error: `Resend said ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}
