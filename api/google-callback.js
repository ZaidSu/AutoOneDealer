import { requiredConfig, getState, tokenRequest, googleGet, sessionCookie, clearStateCookie, clearSessionCookie } from './_utils.js';

function back(res, reason) {
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, '/settings/settings.html?gmail=' + encodeURIComponent(reason));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  try {
    requiredConfig();
    if (req.query.error) return back(res, 'denied');
    const saved = getState(req);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!saved || !state || saved.state !== state || saved.expires < Date.now()) return back(res, 'invalid_state');
    res.setHeader('Set-Cookie', clearStateCookie());
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return back(res, 'missing_code');
    const token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
    const profile = await googleGet('profile', token.access_token);
    const email = String(profile.emailAddress || '').toLowerCase();
    if (email !== process.env.GMAIL_ALLOWED_EMAIL.trim().toLowerCase()) {
      res.setHeader('Set-Cookie', [clearStateCookie(), clearSessionCookie()]);
      return back(res, 'wrong_account');
    }
    if (!token.refresh_token) return back(res, 'no_refresh_token');
    const session = {
      email,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + (token.expires_in || 3600) * 1000
    };
    res.setHeader('Set-Cookie', [clearStateCookie(), sessionCookie(session)]);
    return back(res, 'connected');
  } catch {
    return back(res, 'connection_failed');
  }
}
