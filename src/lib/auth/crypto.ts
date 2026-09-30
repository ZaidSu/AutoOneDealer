// Authenticated encryption for cookie payloads (AES-256-GCM).
// Server-only. Keep this file free of other project imports so it can be unit tested directly.
import crypto from "node:crypto";

function keyFrom(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function seal(value: unknown, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function unseal<T>(raw: string | undefined | null, secret: string): T | null {
  try {
    const parts = String(raw ?? "").split(".");
    if (parts.length !== 3) return null;
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
