// Server-only Supabase REST access. Never import this file into browser code.
export function databaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}
export function requireDatabase() {
  if (!databaseConfigured()) throw new Error('Database not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY, then run supabase/schema.sql.');
}
export async function database(table, { method = 'GET', query = '', data, prefer = '' } = {}) {
  requireDatabase();
  const tables = ['a1_leads', 'a1_settings', 'a1_templates', 'a1_integrations', 'a1_draft_jobs'];
  if (!tables.includes(table)) throw new Error('Unknown database table.');
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}${query ? '?' + query : ''}`;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const legacy = !secret.startsWith('sb_secret_');
  const response = await fetch(url, {
    method,
    headers: {
      apikey: secret,
      ...(legacy ? { Authorization: `Bearer ${secret}` } : {}),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (response.status === 404 || detail.code === '42P01' || detail.code === 'PGRST205') {
      throw new Error('Database tables not found. Run supabase/schema.sql in the Supabase SQL editor.');
    }
    throw new Error(`Database request failed (${response.status}${detail.code ? ` / ${detail.code}` : ''}). Check your Supabase setup.`);
  }
  if (response.status === 204) return [];
  return response.json().catch(() => []);
}
export const ownerQuery = email => 'owner_email=eq.' + encodeURIComponent(email);
export async function getSettings(email) {
  if (!databaseConfigured()) return null;
  const rows = await database('a1_settings', { query: ownerQuery(email) + '&select=*' });
  return rows[0] || null;
}
export async function saveSettings(email, changes) {
  const rows = await database('a1_settings', { method: 'POST', query: 'on_conflict=owner_email', data: { owner_email: email, ...changes, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=representation' });
  return rows[0];
}
export async function trackEmails(email, emails) {
  if (!databaseConfigured() || !emails.length) return { enabled: databaseConfigured(), statuses: {} };
  const ids = emails.map(e => e.id).filter(id => /^[\w-]{1,128}$/.test(id));
  const existing = await database('a1_leads', { query: ownerQuery(email) + '&id=in.(' + ids.join(',') + ')&select=id,status,notes,follow_up_at,draft_id' });
  const map = Object.fromEntries(existing.map(x => [x.id, x]));
  const fresh = emails.filter(e => !map[e.id]).map(e => ({
    id: e.id, owner_email: email, thread_id: e.threadId, sender: e.from, subject: e.subject,
    source: e.source, snippet: e.snippet?.slice(0, 1500) || '', received_at: new Date(e.date).toISOString(), status: 'new'
  }));
  if (fresh.length) {
    const saved = await database('a1_leads', { method: 'POST', query: 'on_conflict=id', data: fresh, prefer: 'resolution=ignore-duplicates,return=representation' });
    for (const x of saved) map[x.id] = x;
  }
  return { enabled: true, statuses: map };
}
