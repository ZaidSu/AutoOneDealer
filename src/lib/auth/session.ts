// Cookie-based sessions. Payloads are encrypted and HTTP-only, so the browser can't read or change them.
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { seal, unseal } from "./crypto";
import { isConfigured, sessionSecret, staffRoleFor } from "./config";
import type { Role } from "./access";

export const STAFF_COOKIE = "__Host-mw_staff";
export const STATE_COOKIE = "__Host-mw_oauth_state";

const STAFF_MAX_AGE = 60 * 60 * 24 * 7; // stay signed in for a week
const STATE_MAX_AGE = 60 * 10; // 10 minutes to finish Google's screen

export type StaffSession = { email: string; name: string; picture?: string; role: Role; exp: number };
export type OAuthState = { state: string; exp: number };

const base = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function setStaffSession(res: NextResponse, session: Omit<StaffSession, "exp">) {
  const value: StaffSession = { ...session, exp: Date.now() + STAFF_MAX_AGE * 1000 };
  res.cookies.set(STAFF_COOKIE, seal(value, sessionSecret()), { ...base, maxAge: STAFF_MAX_AGE });
}

export function setOAuthState(res: NextResponse, state: string) {
  const value: OAuthState = { state, exp: Date.now() + STATE_MAX_AGE * 1000 };
  res.cookies.set(STATE_COOKIE, seal(value, sessionSecret()), { ...base, maxAge: STATE_MAX_AGE });
}

export function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", { ...base, maxAge: 0 });
}

export function readSealed<T>(raw: string | undefined): T | null {
  if (!raw || !isConfigured()) return null;
  return unseal<T>(raw, sessionSecret());
}

/**
 * Returns the signed-in person, re-checking the allowlist on every request
 * so removing someone from STAFF_ACCESS takes effect immediately.
 */
export function validateStaff(raw: string | undefined): StaffSession | null {
  const session = readSealed<StaffSession>(raw);
  if (!session || session.exp < Date.now()) return null;
  const role = staffRoleFor(session.email);
  if (!role) return null;
  return { ...session, role };
}

/** For Server Components and Server Actions. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const jar = await cookies();
  return validateStaff(jar.get(STAFF_COOKIE)?.value);
}
