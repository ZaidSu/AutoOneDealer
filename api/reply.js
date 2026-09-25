import { json } from './_utils.js';
import { database, databaseConfigured, ownerQuery } from './_db.js';
import { requireSession, writeAllowed, errorResponse } from './_request.js';
import { fetchLeadMessage, verifyProof, mimeReply, gmailPost, validateRecipient } from './_workflows.js';
export default async function handler(req,res) {
  if(!writeAllowed(req,res))return;
  try {
    const session=await requireSession(req,res);if(!session)return;
    const { id,proof,recipient,body,action,confirmed }=req.body||{};
    if(!verifyProof(String(id||''),session.email,proof))return json(res,403,{error:'Select a lead in Inbox first.'});
    if(!session.scopes?.includes('gmail.compose'))return json(res,403,{error:'Reconnect Gmail in Settings and grant Gmail compose access to save or send replies.'});
    if(!['draft','send'].includes(action))return json(res,400,{error:'Choose Draft or Send.'});
    if(action==='send' && confirmed!==true)return json(res,400,{error:'Confirm the recipient and reply before sending.'});
    const to=validateRecipient(recipient);
    const message=await fetchLeadMessage(session.access_token,id);
    if(typeof body!=='string'||!body.trim()||body.length>18000)return json(res,400,{error:'Write a reply under 18,000 characters.'});
    const raw=mimeReply(message,to,body.trim(),session.email);
    const result=action==='draft'
      ? await gmailPost('drafts',session.access_token,{message:{raw,threadId:message.threadId}})
      : await gmailPost('messages/send',session.access_token,{raw,threadId:message.threadId});
    if(databaseConfigured()) {
      await database('a1_leads',{method:'PATCH',query:ownerQuery(session.email)+'&id=eq.'+id,data:{status:action==='draft'?'drafted':'contacted',...(action==='draft'?{draft_id:result.id}:{}),updated_at:new Date().toISOString()}}).catch(err=>console.error('Lead status update failed:',err.message));
    }
    return json(res,200,{ok:true,action,id:result.id||null});
  } catch(err){return errorResponse(res,err);}
}
