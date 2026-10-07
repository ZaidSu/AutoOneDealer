// Cookie-based sessions. Payloads are encrypted and HTTP-only, so the browser can't read or change them.
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { seal, unseal } from "./crypto";
import { isConfigured, openLoginEnabled, sessionSecret, staffRoleFor } from "./config";
import type { Role } from "./access";

export const STAFF_COOKIE = "__Host-ad_staff";
export const STATE_COOKIE = "__Host-ad_oauth_state";
// Temporary Gmail connection storage until the shared database arrives (Phase 3).
export const GMAIL_COOKIE = "__Host-ad_gmail";

const STAFF_MAX_AGE = 60 * 60 * 12; // 12 hours: one working day
const OPEN_MAX_AGE = 60 * 60 * 24 * 30; // open login: stay signed in for 30 days
const STATE_MAX_AGE = 60 * 10; // 10 minutes to finish Google's screen
const GMAIL_MAX_AGE = 60 * 60 * 24 * 30;

export type StaffSession = { email: string; name: string; picture?: string; role: Role; exp: number; open?: boolean };
export type OAuthState = { state: string; flow: "signin" | "gmail"; exp: number };
export type GmailConnection = { mailbox: string; refreshToken: string; connectedBy: string; connectedAt: number; scopes?: string };

const base = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function setStaffSession(res: NextResponse, session: Omit<StaffSession, "exp">) {
  const maxAge = session.open ? OPEN_MAX_AGE : STAFF_MAX_AGE;
  const value: StaffSession = { ...session, exp: Date.now() + maxAge * 1000 };
  res.cookies.set(STAFF_COOKIE, seal(value, sessionSecret()), { ...base, maxAge });
}

export function setOAuthState(res: NextResponse, state: string, flow: OAuthState["flow"]) {
  const value: OAuthState = { state, flow, exp: Date.now() + STATE_MAX_AGE * 1000 };
  res.cookies.set(STATE_COOKIE, seal(value, sessionSecret()), { ...base, maxAge: STATE_MAX_AGE });
}

export function setGmailConnection(res: NextResponse, connection: GmailConnection) {
  res.cookies.set(GMAIL_COOKIE, seal(connection, sessionSecret()), { ...base, maxAge: GMAIL_MAX_AGE });
}

export function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", { ...base, maxAge: 0 });
}

export function readSealed<T>(raw: string | undefined): T | null {
  if (!raw || !isConfigured()) return null;
  return unseal<T>(raw, sessionSecret());
}

/**
 * Returns the signed-in staff member, re-checking the allowlist on every request
 * so removing someone from STAFF_ACCESS takes effect immediately.
 */
export function validateStaff(raw: string | undefined): StaffSession | null {
  const session = readSealed<StaffSession>(raw);
  if (!session || session.exp < Date.now()) return null;
  if (session.open) return openLoginEnabled() ? session : null;
  const role = staffRoleFor(session.email);
  if (!role) return null;
  return { ...session, role };
}

/** For Server Components and Server Actions. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const jar = await cookies();
  return validateStaff(jar.get(STAFF_COOKIE)?.value);
}
