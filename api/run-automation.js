import { json } from './_utils.js';
import { writeAllowed,requireSession,errorResponse } from './_request.js';
import { runDraftScan } from './_workflows.js';
export default async function handler(req,res) {
  if(!writeAllowed(req,res))return;
  try { const session=await requireSession(req,res);if(!session)return;
    if(!session.scopes?.includes('gmail.compose'))return json(res,403,{error:'Reconnect Gmail to grant Gmail compose access.'});
    return json(res,200,await runDraftScan(session));
  } catch(err){return errorResponse(res,err);}
}
