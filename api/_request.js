import { authorizedSession, json } from './_utils.js';
export function writeAllowed(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    json(res, 405, { error: 'Method not allowed.' }); return false;
  }
  const origin = req.headers?.origin;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  if (origin && host && origin !== `${proto}://${host}` && origin !== `http://${host}`) {
    json(res, 403, { error: 'Invalid request origin.' }); return false;
  }
  const type = req.headers?.['content-type'] || '';
  if (!type.startsWith('application/json')) { json(res, 415, { error: 'Expected application/json.' }); return false; }
  return true;
}
export async function requireSession(req, res) {
  const session = await authorizedSession(req, res);
  if (!session) json(res, 401, { error: 'Connect your approved Gmail account in Settings first.' });
  return session;
}
export function errorResponse(res, err) {
  const message = String(err?.message || 'Request failed.');
  const client = /^(Enter |Reply |Invalid |Missing |No |Turn on|Automatic |Database |OPENAI_|Gmail draft|AI request|AI returned|Unknown|Select |Set |Configure |Reconnect )/.test(message);
  return json(res, client ? 400 : 502, { error: client ? message : 'Request failed. Check your connected services and try again.' });
}
