// Google OAuth and Gmail calls. Server-only.

export const SIGNIN_SCOPES = ["openid", "email", "profile"];
// Read-only for now. Sending email needs its own scope, added only when that feature is built.
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

type AuthUrlOptions = { state: string; scopes: string[]; offline?: boolean; loginHint?: string };

export function googleAuthUrl({ state, scopes, offline, loginHint }: AuthUrlOptions): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const params: Record<string, string> = {
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    scope: scopes.join(" "),
    state,
  };
  if (offline) {
    params.access_type = "offline";
    params.prompt = "consent"; // guarantees a refresh token even if access was granted before
  } else {
    params.prompt = "select_account";
  }
  if (loginHint) params.login_hint = loginHint;
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

export type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // Log Google's error code only; never log tokens.
    console.error("Google token request failed:", response.status, data?.error ?? "unknown");
    throw new Error("google_token_failed");
  }
  return data as TokenResponse;
}

export function exchangeCode(code: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "" });
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export type GoogleProfile = { email?: string; email_verified?: boolean; name?: string; picture?: string };

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("google_profile_failed");
  return response.json();
}

export type GmailProfile = { emailAddress: string; messagesTotal?: number; threadsTotal?: number };

export async function fetchGmailProfile(accessToken: string): Promise<GmailProfile> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "gmail_denied" : "gmail_failed");
  return response.json();
}

export async function revokeToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
