// Reads server configuration. Never import this into client components.
import { normalizeEmail, parseStaffAccess, type Role } from "./access";

export const REQUIRED_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SESSION_SECRET",
  "GMAIL_ALLOWED_EMAIL",
] as const;

export const OPTIONAL_VARS = ["STAFF_ACCESS", "REQUIRE_GOOGLE_SIGNIN"] as const;

/**
 * Open login: the username/password screen lets anyone in without checking anything.
 * Chosen deliberately for now (site shared only with trusted people).
 * Set REQUIRE_GOOGLE_SIGNIN=true in Vercel to switch back to Google sign-in with the staff allowlist;
 * existing open sessions stop working immediately when you do.
 */
export function openLoginEnabled(): boolean {
  return process.env.REQUIRE_GOOGLE_SIGNIN !== "true";
}

export function missingConfig(): string[] {
  const missing: string[] = REQUIRED_VARS.filter((name) => !process.env[name]);
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret && secret.length < 32) missing.push("SESSION_SECRET (must be at least 32 characters)");
  return missing;
}

export function isConfigured(): boolean {
  return missingConfig().length === 0;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new ConfigError();
  return secret;
}

export function dealershipMailbox(): string {
  return normalizeEmail(process.env.GMAIL_ALLOWED_EMAIL);
}

export function staffRoleFor(email: string): Role | null {
  const staff = parseStaffAccess(process.env.STAFF_ACCESS, process.env.GMAIL_ALLOWED_EMAIL);
  return staff.get(normalizeEmail(email)) ?? null;
}

export class ConfigError extends Error {
  constructor() {
    super("AutoDash is missing required server settings.");
  }
}
