// Google sign-in (identity only: name and email, never Gmail or Drive access). Server-only.

export const SIGNIN_SCOPES = ["openid", "email", "profile"];

export function googleAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    scope: SIGNIN_SCOPES.join(" "),
    state,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type TokenResponse = { access_token: string; expires_in?: number; scope?: string };

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // Log Google's error code only; never log tokens.
    console.error("Google token request failed:", response.status, data?.error ?? "unknown");
    throw new Error(`google_token_${data?.error ?? response.status}`);
  }
  return data as TokenResponse;
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
