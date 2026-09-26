// Reads server configuration. Never import this into client components.
import { normalizeEmail, parseStaffAccess, type Role } from "./access";

export const REQUIRED_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SESSION_SECRET",
  "GMAIL_ALLOWED_EMAIL",
] as const;

export const OPTIONAL_VARS = ["STAFF_ACCESS"] as const;

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
