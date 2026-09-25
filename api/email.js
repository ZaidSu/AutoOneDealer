import { method, json } from './_utils.js';
import { requireSession, errorResponse } from './_request.js';
import { fetchLeadMessage, verifyProof, proofFor } from './_workflows.js';
export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const session = await requireSession(req, res); if (!session) return;
    const id = typeof req.query?.id === 'string' ? req.query.id : '';
    if (!verifyProof(id, session.email, req.query?.proof)) return json(res, 403, { error: 'Message was not selected from the lead inbox. Refresh Inbox.' });
    const email = await fetchLeadMessage(session.access_token, id);
    return json(res, 200, { email: { ...email, proof: proofFor(id, session.email) } });
  } catch (err) { return errorResponse(res, err); }
}
