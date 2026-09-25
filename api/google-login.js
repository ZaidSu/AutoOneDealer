import crypto from 'node:crypto';
import { method, json, requiredConfig, stateCookie } from './_utils.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    requiredConfig();
    const state = crypto.randomBytes(32).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose',
      access_type: 'offline',
      prompt: 'consent',
      state
    }).toString();
    res.setHeader('Set-Cookie', stateCookie(state));
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, url.toString());
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
