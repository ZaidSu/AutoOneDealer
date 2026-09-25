import { json } from './_utils.js';
import { databaseConfigured, getSettings, saveSettings } from './_db.js';
import { requireSession, writeAllowed, errorResponse } from './_request.js';
export const DEFAULT_SETTINGS = { business_name:'Auto One Motors', website:'', address:'', phone:'', hours:'', tone:'Friendly, concise and professional', finance_rules:'Never guarantee approval or quote unverified financing terms.', sensitive_topics:'Financing approvals, exact payments, disputes, refunds and legal complaints require human review.', ai_instructions:'Do not promise vehicle availability before checking with the team.', auto_draft_enabled:false };
const limits = { business_name:120, website:250, address:500, phone:90, hours:900, tone:500, finance_rules:3000, sensitive_topics:3000, ai_instructions:6000 };
export default async function handler(req, res) {
  try {
    const session = await requireSession(req, res); if (!session) return;
    if (req.method === 'GET') {
      const saved = await getSettings(session.email);
      return json(res, 200, { configured: databaseConfigured(), settings: { ...DEFAULT_SETTINGS, ...saved } });
    }
    if (!writeAllowed(req,res)) return;
    if (!databaseConfigured()) return json(res, 503, { error: 'Configure Supabase and run supabase/schema.sql before saving settings.' });
    const changes = {};
    for (const [field,max] of Object.entries(limits)) {
      if (Object.hasOwn(req.body || {}, field)) {
        if (typeof req.body[field] !== 'string' || req.body[field].length > max) return json(res, 400, { error: `Invalid ${field} (maximum ${max} characters).` });
        changes[field] = req.body[field].trim();
      }
    }
    if (Object.hasOwn(req.body || {}, 'auto_draft_enabled')) {
      if (typeof req.body.auto_draft_enabled !== 'boolean') return json(res,400,{error:'Invalid auto-draft setting.'});
      changes.auto_draft_enabled = req.body.auto_draft_enabled;
    }
    if (!Object.keys(changes).length) return json(res, 400, { error: 'No settings supplied.' });
    const settings = await saveSettings(session.email, changes);
    return json(res, 200, { settings: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (err) { return errorResponse(res, err); }
}
