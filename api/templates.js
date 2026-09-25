import crypto from 'node:crypto';
import { json } from './_utils.js';
import { database, databaseConfigured, ownerQuery } from './_db.js';
import { requireSession, writeAllowed, errorResponse } from './_request.js';
export const STARTER_TEMPLATES = [
  { slug:'new-lead', title:'New Lead Response', category:'General', body:'Hi,\n\nThank you for contacting Auto One Motors! We received your inquiry and would be happy to help. Which vehicle are you interested in, and what is the best way to reach you?\n\nBest,\nAuto One Motors' },
  { slug:'financing', title:'Financing Interest', category:'Financing', body:'Hi,\n\nThanks for reaching out about financing. Our team works with customers in a variety of credit situations. We can go over the available options after reviewing your information; approval and exact terms cannot be guaranteed. Would you prefer a call or a visit?\n\nBest,\nAuto One Motors' },
  { slug:'availability', title:'Vehicle Availability', category:'Inventory', body:'Hi,\n\nThanks for your interest in the vehicle! Let me confirm its current availability with our team. Would you like to schedule a time to take a look?\n\nBest,\nAuto One Motors' },
  { slug:'appointment', title:'Schedule a Visit', category:'Appointment', body:'Hi,\n\nWe would love to have you visit Auto One Motors. What day and time works best for you? Our team can confirm an appointment once we hear back.\n\nBest,\nAuto One Motors' }
];
export default async function handler(req,res) {
  try {
    const session = await requireSession(req,res); if (!session) return;
    if (req.method === 'GET') {
      const saved = databaseConfigured() ? await database('a1_templates',{ query:ownerQuery(session.email)+'&select=*&order=title.asc' }) : [];
      const bySlug = new Map(saved.map(x => [x.slug,x]));
      return json(res, 200, { configured: databaseConfigured(), templates:[...STARTER_TEMPLATES.map(t=>bySlug.get(t.slug)||{...t,starter:true}),...saved.filter(t=>!STARTER_TEMPLATES.some(x=>x.slug===t.slug))] });
    }
    if (!writeAllowed(req,res)) return;
    if (!databaseConfigured()) return json(res,503,{error:'Configure Supabase before saving templates.'});
    if (req.method === 'DELETE') {
      const slug = String(req.body?.slug||'');
      if (!/^[\w-]{1,80}$/.test(slug)) return json(res,400,{error:'Invalid template.'});
      await database('a1_templates',{method:'DELETE',query:ownerQuery(session.email)+'&slug=eq.'+slug,prefer:'return=representation'});
      return json(res,200,{deleted:slug});
    }
    const { slug, title, category, body } = req.body||{};
    const safeSlug = slug ? String(slug) : crypto.randomUUID();
    if (!/^[\w-]{1,80}$/.test(safeSlug) || typeof title!=='string' || !title.trim() || title.length>100 || typeof category!=='string' || category.length>60 || typeof body!=='string' || !body.trim() || body.length>8000) return json(res,400,{error:'Provide a title, category and message (under 8,000 characters).'});
    const result=await database('a1_templates',{method:'POST',query:'on_conflict=owner_email,slug',data:{owner_email:session.email,slug:safeSlug,title:title.trim(),category:category.trim(),body:body.trim(),updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=representation'});
    return json(res,200,{template:result[0]});
  } catch(err) {return errorResponse(res,err);}
}
