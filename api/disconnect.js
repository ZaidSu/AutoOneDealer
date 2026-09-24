import { method, json, clearSessionCookie, clearStateCookie } from './_utils.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  // Clearing this browser's encrypted session doesn't revoke Google's grant.
  res.setHeader('Set-Cookie', [clearSessionCookie(), clearStateCookie()]);
  return json(res, 200, { connected: false });
}
