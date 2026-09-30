import type { NextRequest } from "next/server";

/**
 * Blocks cross-site form posts. Cookies are SameSite=Lax already; this is a second check
 * for state-changing requests.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === req.nextUrl.origin;
}
