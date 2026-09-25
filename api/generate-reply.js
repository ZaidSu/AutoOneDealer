import { json } from './_utils.js';
import { requireSession, writeAllowed, errorResponse } from './_request.js';
import { verifyProof, fetchLeadMessage, generateReply } from './_workflows.js';
import { getSettings } from './_db.js';
export default async function handler(req,res) {
  if (!writeAllowed(req,res)) return;
  try {
    const session = await requireSession(req,res); if(!session)return;
    const id=String(req.body?.id||'');
    if(!verifyProof(id,session.email,req.body?.proof)) return json(res,403,{error:'Refresh Inbox and select a lead email first.'});
    const message = await fetchLeadMessage(session.access_token,id);
    const settings = await getSettings(session.email) || {};
    const template = typeof req.body?.template==='string' ? req.body.template.slice(0,8000) : '';
    const reply = await generateReply(message,settings,template);
    return json(res,200,{reply});
  } catch(err){return errorResponse(res,err);}
}
