import { getSession, json, method } from './_utils.js';
import { leadQuery } from './_leads.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  const session = getSession(req);
  const allowed = process.env.GMAIL_ALLOWED_EMAIL?.trim().toLowerCase();
  const connected = Boolean(session?.refresh_token && allowed && session.email === allowed);
  return json(res, 200, { connected, email: connected ? session.email : null, readOnly: true, leadQuery: connected ? leadQuery() : null, customFilter: Boolean(process.env.LEAD_GMAIL_QUERY?.trim()) });
}
