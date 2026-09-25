import { json, method } from './_utils.js';
import { database, databaseConfigured, ownerQuery } from './_db.js';
import { requireSession, writeAllowed, errorResponse } from './_request.js';
import { verifyProof, proofFor } from './_workflows.js';
const validStatuses = ['new','contacted','drafted','appointment','won','lost'];
export default async function handler(req, res) {
  try {
    const session = await requireSession(req, res); if (!session) return;
    if (req.method === 'GET') {
      if (!databaseConfigured()) return json(res, 200, { configured: false, leads: [] });
      const rows = await database('a1_leads', { query: ownerQuery(session.email) + '&select=*&order=received_at.desc&limit=200' });
      return json(res, 200, { configured: true, leads: rows.map(x => ({ ...x, proof: proofFor(x.id, session.email) })) });
    }
    if (!writeAllowed(req, res)) return;
    if (!databaseConfigured()) return json(res, 503, { error: 'Configure Supabase and run supabase/schema.sql before saving leads.' });
    const id = String(req.body?.id || '');
    if (!verifyProof(id, session.email, req.body?.proof)) return json(res, 403, { error: 'Select a lead from Inbox before editing it.' });
    const status = req.body?.status;
    const notes = req.body?.notes;
    const followUp = req.body?.follow_up_at;
    const changes = { updated_at: new Date().toISOString() };
    if (status !== undefined) { if (!validStatuses.includes(status)) return json(res, 400, { error: 'Invalid lead status.' }); changes.status = status; }
    if (notes !== undefined) { if (typeof notes !== 'string' || notes.length > 5000) return json(res, 400, { error: 'Notes must be under 5,000 characters.' }); changes.notes = notes; }
    if (followUp !== undefined) { if (followUp !== null && (typeof followUp !== 'string' || Number.isNaN(Date.parse(followUp)))) return json(res, 400, { error: 'Invalid follow-up date.' }); changes.follow_up_at = followUp; }
    const rows = await database('a1_leads', { method: 'PATCH', query: ownerQuery(session.email) + '&id=eq.' + id, data: changes, prefer: 'return=representation' });
    if (!rows.length) return json(res, 404, { error: 'Lead not found. Refresh Inbox first.' });
    return json(res, 200, { lead: rows[0] });
  } catch (err) { return errorResponse(res, err); }
}
