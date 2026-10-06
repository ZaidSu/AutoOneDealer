// Google OAuth and Gmail calls. Server-only.

export const SIGNIN_SCOPES = ["openid", "email", "profile"];
// Read the mailbox, and send the AI replies a person approves (nothing else: no deleting, no changing mail).
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
// Also allowed to mark the emails AutoDash has handled as read (nothing else: it never deletes or moves mail).
export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", GMAIL_SEND_SCOPE, GMAIL_MODIFY_SCOPE];
/** Connections made before sending was added don't have permission to send until Gmail is reconnected. */
export const canSendFrom = (c: { scopes?: string } | null) => Boolean(c?.scopes?.split(" ").includes(GMAIL_SEND_SCOPE));
/** Connections made before this was added can't mark emails as read until Gmail is reconnected. */
export const canMarkRead = (c: { scopes?: string } | null) => Boolean(c?.scopes?.split(" ").includes(GMAIL_MODIFY_SCOPE));

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
    throw new GoogleError("token", String(data?.error ?? response.status));
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
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? String(response.status);
    console.error("Gmail profile request failed:", response.status, reason);
    throw new GoogleError("gmail", `${response.status}:${reason}`);
  }
  return response.json();
}

/** Carries Google's own error code (never tokens) so the app can explain what went wrong. */
export class GoogleError extends Error {
  constructor(readonly stage: "token" | "gmail", readonly code: string) {
    super(`google_${stage}_${code}`);
  }
}

/** Plain-English explanation for a failed Gmail check, plus a short code for troubleshooting. */
export function explainGoogleError(error: unknown): { message: string; code: string } {
  if (!(error instanceof GoogleError)) {
    const detail = error instanceof Error ? error.message.replace(/[^\w:.-]/g, "_").slice(0, 60) : "unknown";
    return { message: "Something went wrong talking to Google. Try again in a minute.", code: `unexpected:${detail}` };
  }
  const code = `${error.stage}:${error.code}`;
  if (error.stage === "token") {
    if (error.code === "invalid_grant")
      return { code, message: "Google cancelled this connection. That happens if it was disconnected, the Google password changed, or the app is in Google's Testing mode for over 7 days. Click Reconnect Gmail." };
    if (error.code === "invalid_client" || error.code === "unauthorized_client")
      return { code, message: "This site's Google client ID or secret doesn't match Google Cloud. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel." };
    return { code, message: "Google refused to refresh the connection. Click Reconnect Gmail." };
  }
  if (/^429|rateLimitExceeded|userRateLimitExceeded/i.test(error.code))
    return { code, message: "Gmail asked AutoDash to slow down because a lot of emails were read at once. Nothing is lost. Wait a minute and refresh." };
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(error.code))
    return { code, message: "The Gmail API is turned off in Google Cloud. Turn on \"Gmail API\" for this project, then test again." };
  if (/^(401|403)/.test(error.code))
    return { code, message: "Google connected, but Gmail refused access. When reconnecting, make sure the box to let AutoDash read email is ticked on Google's screen." };
  return { code, message: "Gmail didn't respond properly. Try again in a minute." };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
