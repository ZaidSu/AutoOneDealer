import { method, json, clearSessionCookie, clearStateCookie, getSession, allowedEmail } from './_utils.js';
import { writeAllowed } from './_request.js';
import { database, databaseConfigured, ownerQuery } from './_db.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!writeAllowed(req, res)) return;
  const session = getSession(req);
  const warnings = [];
  if (session?.email === allowedEmail()) {
    // Stop scheduled access before clearing this browser's session.
    if (databaseConfigured()) {
      try { await database('a1_settings', { method:'PATCH', query: ownerQuery(session.email), data: { auto_draft_enabled:false } }); }
      catch { warnings.push('Could not disable scheduled drafts in the database.'); }
      try { await database('a1_integrations', { method:'DELETE', query: ownerQuery(session.email) }); }
      catch { warnings.push('Could not delete stored Google credentials in the database.'); }
    }
    if (session.refresh_token) {
      try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(session.refresh_token), { method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'} }); }
      catch { warnings.push('Google permission could not be revoked automatically.'); }
    }
  }
  res.setHeader('Set-Cookie', [clearSessionCookie(), clearStateCookie()]);
  return json(res, 200, { connected: false, warnings });
}
