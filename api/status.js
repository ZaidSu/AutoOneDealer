import { databaseConfigured } from './_db.js';
import { getSession, json, method, allowedEmail } from './_utils.js';
import { leadQuery } from './_leads.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  const session = getSession(req);
  const allowed = allowedEmail();
  const connected = Boolean(session?.refresh_token && allowed && session.email === allowed);
  return json(res, 200, { connected, email: connected ? session.email : null, canCompose: connected && Boolean(session.scopes?.includes('gmail.compose')), database: databaseConfigured(), ai: Boolean(process.env.OPENAI_API_KEY), cron: Boolean(process.env.CRON_SECRET), leadQuery: connected ? leadQuery() : null, customFilter: Boolean(process.env.LEAD_GMAIL_QUERY?.trim()) });
}
