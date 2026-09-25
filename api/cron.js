import { json,method } from './_utils.js';
import { runDraftScan,scheduledToken } from './_workflows.js';
export default async function handler(req,res) {
  if(!method(req,res,'GET'))return;
  if(!process.env.CRON_SECRET || req.headers?.authorization!==`Bearer ${process.env.CRON_SECRET}`)return json(res,401,{error:'Unauthorized.'});
  try {return json(res,200,await runDraftScan(await scheduledToken()));}
  catch(err){console.error('Auto One cron failed:',err.message);return json(res,503,{error:'Draft scan failed. Check server logs and connected services.'});}
}
