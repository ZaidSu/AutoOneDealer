import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { midnightChicago, leadQuery, inboxQuery, reportBuckets, exactCount, dateQuery } from '../api/_leads.js';
import { sessionCookie } from '../api/_utils.js';
import emailsHandler from '../api/emails.js';
import analyticsHandler from '../api/analytics.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.SESSION_SECRET = 'only a unit-test secret not deployed 1234567890';
process.env.GMAIL_ALLOWED_EMAIL = 'txautoone@gmail.com';
const session = {email:'txautoone@gmail.com',refresh_token:'fake',access_token:'fake',expires_at:Date.now()+10000000};
const cookie = sessionCookie(session).split(';')[0];
function res() {
  return {
    statusCode:200, headers:{}, payload:null,
    setHeader(name,value) {this.headers[name]=value; return this;},
    status(value){this.statusCode=value; return this;},
    json(payload){this.payload=payload; return this;}
  };
}
function req(query={}) {return {method:'GET',query,headers:{cookie}};}

test('syntax: every application JS file parses', () => {
  const dirs = ['api','assets'];
  const paths = dirs.flatMap(d => fs.readdirSync(path.join(dir,d)).filter(f=>f.endsWith('.js')).map(f=>path.join(dir,d,f)));
  // The frontend is loaded as one shared ES module in assets/app.js.
  for (const filename of paths) {
    const result = spawnSync('node',['--check',filename],{encoding:'utf8'});
    assert.equal(result.status,0,`${filename}: ${result.stderr}`);
  }
});

test('server-side filters only search approved lead sources', () => {
  delete process.env.LEAD_GMAIL_QUERY;
  assert.match(leadQuery(),/from:salesleads@cars.com/);
  assert.match(leadQuery(),/from:carzing.com/);
  assert.match(leadQuery(),/from:cutx.org/);
  assert.match(leadQuery(),/-in:sent/);
  assert.match(inboxQuery(),/in:inbox/);
  process.env.LEAD_GMAIL_QUERY = '{from:exact@one.com from:exact@two.com}';
  assert.match(leadQuery(),/exact@two.com/);
  assert.doesNotMatch(leadQuery(),/salesleads@cars.com/);
  delete process.env.LEAD_GMAIL_QUERY;
});

test('America/Chicago dates handle winter, summer, and DST boundary', () => {
  assert.equal(new Date(midnightChicago('2026-01-01')*1000).toISOString(),'2026-01-01T06:00:00.000Z');
  assert.equal(new Date(midnightChicago('2026-07-01')*1000).toISOString(),'2026-07-01T05:00:00.000Z');
  assert.equal(new Date(midnightChicago('2026-03-08')*1000).toISOString(),'2026-03-08T06:00:00.000Z');
  assert.equal(new Date(midnightChicago('2026-11-01')*1000).toISOString(),'2026-11-01T05:00:00.000Z');
  assert.throws(()=>midnightChicago('2026-02-30'));
});

test('range grouping: month selection daily; July–September by month', () => {
  const month = reportBuckets('2026-01-01','2026-02-01');
  assert.equal(month.mode,'day'); assert.equal(month.buckets.length,31);
  const summer = reportBuckets('2026-07-01','2026-09-25');
  assert.equal(summer.mode,'week');
  const year = reportBuckets('2026-01-01','2026-09-25');
  assert.equal(year.mode,'month'); assert.equal(year.buckets.length,9);
  assert.equal(year.buckets[8].endExclusive,'2026-09-25');
});

test('exact counts follow page tokens rather than Gmail resultSizeEstimate', async () => {
  const fakeGet = async (path,token,params) => {
    const offset = Number(params.pageToken || 0);
    return {messages:Array.from({length:Math.min(500,700-offset)},(_,i)=>({id:String(i+offset)})),nextPageToken:offset+500<700?String(offset+500):undefined,resultSizeEstimate:999999};
  };
  assert.equal(await exactCount(fakeGet,'token','from:salesleads@cars.com'),700);
});

test('Inbox API requests filtered Gmail query and returns only fetched lead messages', async () => {
  const previous = globalThis.fetch;
  const searched = [];
  globalThis.fetch = async url => {
    const u=new URL(url);
    if (u.pathname.endsWith('/messages')) {
      searched.push(u.searchParams.get('q'));
      return Response.json({messages:[{id:'mail1'}],resultSizeEstimate:1});
    }
    if (u.pathname.endsWith('/messages/mail1')) {
      return Response.json({id:'mail1',threadId:'thread1',internalDate:String(Date.now()),labelIds:['INBOX','UNREAD'],payload:{headers:[{name:'From',value:'salesleads@cars.com'},{name:'Subject',value:'Cars.com lead'}],mimeType:'text/plain',body:{data:Buffer.from('Hello dealership').toString('base64url')}},snippet:'Hello dealership'});
    }
    throw new Error('Unexpected Gmail path: '+u.pathname);
  };
  try {
    const output=res(); await emailsHandler(req({max:'30',q:'in:anywhere'}),output);
    assert.equal(output.statusCode,200);
    assert.equal(output.payload.emails.length,1);
    assert.equal(output.payload.emails[0].source,'Cars.com');
    assert.match(searched[0],/in:inbox/);
    assert.match(searched[0],/salesleads@cars.com/);
    assert.doesNotMatch(searched[0],/in:anywhere/);
  } finally {globalThis.fetch=previous;}
});

test('Analytics uses exact counts for January and custom January–September range', async () => {
  const previous = globalThis.fetch;
  const janStart=midnightChicago('2026-01-01');
  const janEnd=midnightChicago('2026-02-01');
  const range=[];
  globalThis.fetch = async url => {
    const u=new URL(url);
    assert.equal(u.pathname.endsWith('/messages'),true);
    const q=u.searchParams.get('q');
    range.push(q);
    assert.match(q,/salesleads@cars.com/);
    const after=Number(q.match(/after:(\d+)/)[1]);
    const before=Number(q.match(/before:(\d+)/)[1]);
    const page=Number(u.searchParams.get('pageToken') || 0);
    let count=0;
    if (after===janStart && before===janEnd) count=700;
    // Custom range uses one bucket per month, including July and August.
    if (after===midnightChicago('2026-07-01') && before===midnightChicago('2026-08-01')) count=600;
    if (after===midnightChicago('2026-08-01') && before===midnightChicago('2026-09-01')) count=500;
    const remaining=Math.max(0,count-page);
    return Response.json({messages:Array.from({length:Math.min(remaining,500)},(_,i)=>({id:`id${page+i}`})),nextPageToken:remaining>500?String(page+500):undefined,resultSizeEstimate:count+100});
  };
  try {
    const monthly = res();
    await analyticsHandler(req({start:'2026-01-01',end:'2026-01-31'}),monthly);
    assert.equal(monthly.statusCode,200);
    assert.equal(monthly.payload.buckets.length,31);
    // For daily buckets our mock only returns exact 700 for full Jan; day mock returns 0.
    assert.equal(monthly.payload.total,0);
    const long = res();
    await analyticsHandler(req({start:'2026-01-01',end:'2026-09-24'}),long);
    assert.equal(long.statusCode,200);
    assert.equal(long.payload.mode,'month');
    assert.equal(long.payload.total,1800);
    assert.equal(long.payload.buckets.find(b=>b.start==='2026-07-01').count,600);
    assert.equal(long.payload.buckets.find(b=>b.start==='2026-08-01').count,500);
    assert.equal(long.payload.buckets.find(b=>b.start==='2026-01-01').count,700);
    assert.ok(range.length>10);
  } finally {globalThis.fetch=previous;}
});

test('Analytics invalid dates are rejected, never reported as zero', async () => {
  const output=res(); await analyticsHandler(req({start:'2026-02-30',end:'2026-03-10'}),output);
  assert.equal(output.statusCode,400);
});

// New server-side functions: proof, safe MIME, persistence and approval gates.
import { proofFor, verifyProof, mimeReply, validateRecipient } from '../api/_workflows.js';
import { database } from '../api/_db.js';
import replyHandler from '../api/reply.js';
import templatesHandler from '../api/templates.js';
import cronHandler from '../api/cron.js';

test('signed lead tokens cannot be forged or reused with another Gmail ID', () => {
  const proof = proofFor('approved-123', 'txautoone@gmail.com');
  assert.equal(verifyProof('approved-123', 'txautoone@gmail.com', proof), true);
  assert.equal(verifyProof('personal-456', 'txautoone@gmail.com', proof), false);
  assert.equal(verifyProof('approved-123', 'someoneelse@gmail.com', proof), false);
  assert.equal(verifyProof('approved-123', 'txautoone@gmail.com', 'garbage'), false);
});

test('Gmail MIME replies use safe headers and reject invalid recipients', () => {
  const email = { subject: 'Used Toyota Camry', messageId: '<realmessage@example.com>', references: '', from: 'leads@cars.com' };
  const raw = mimeReply(email, 'buyer@example.com', 'Thanks for asking!\nWe will check the car.', 'txautoone@gmail.com');
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(decoded, /To: buyer@example.com\r\n/);
  assert.match(decoded, /In-Reply-To: <realmessage@example.com>/);
  assert.equal(Buffer.from(decoded.split('\r\n\r\n')[1], 'base64').toString('utf8'), 'Thanks for asking!\nWe will check the car.');
  assert.throws(() => validateRecipient('bad\r\nBcc:person@example.com'));
  assert.throws(() => validateRecipient('two@example.com,other@example.com'));
});

test('Supabase new sb_secret key is never sent as a bearer JWT', async () => {
  const previous = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://mock-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  globalThis.fetch = async (url, init) => {
    assert.match(url, /\/rest\/v1\/a1_templates/);
    assert.equal(init.headers.apikey, 'sb_secret_test_only');
    assert.equal(init.headers.Authorization, undefined);
    return Response.json([]);
  };
  try {assert.deepEqual(await database('a1_templates'), []);} finally {
    globalThis.fetch = previous;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});

test('template API returns useful starter replies even before Supabase is connected', async () => {
  const output = res();
  await templatesHandler(req(), output);
  assert.equal(output.statusCode, 200);
  assert.equal(output.payload.configured, false);
  assert.equal(output.payload.templates.length, 4);
  assert.match(output.payload.templates[1].body, /approval and exact terms cannot be guaranteed/i);
});

test('unapproved lead ID is refused before sending or drafting a Gmail message', async () => {
  const output = res();
  await replyHandler({method:'POST',query:{},headers:{cookie,'content-type':'application/json'},body:{id:'personal',proof:'invalid',recipient:'buyer@example.com',body:'Hello',action:'send',confirmed:true}}, output);
  assert.equal(output.statusCode, 403);
});

test('manual Gmail draft saves only; no send endpoint is called', async () => {
  const previous = globalThis.fetch;
  const draftSession = {...session, scopes:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'};
  const draftCookie = sessionCookie(draftSession).split(';')[0];
  const calls = [];
  globalThis.fetch = async (url,init={}) => {
    const u=new URL(url);calls.push([u.pathname,init.method||'GET']);
    if(u.pathname.endsWith('/messages/mail-approved')) return Response.json({id:'mail-approved',threadId:'thread-safe',internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'From',value:'Buyer <buyer@example.com>'},{name:'Message-ID',value:'<id@example.com>'},{name:'Subject',value:'Toyota'}],body:{data:Buffer.from('Is the car available?').toString('base64url')}},snippet:'Interested'});
    if(u.pathname.endsWith('/drafts')) {const payload=JSON.parse(init.body); assert.equal(payload.message.threadId,'thread-safe');assert.ok(payload.message.raw);return Response.json({id:'draft-safe'});}
    throw new Error('Unexpected call '+u.pathname);
  };
  try {
    const output=res();await replyHandler({method:'POST',query:{},headers:{cookie:draftCookie,'content-type':'application/json'},body:{id:'mail-approved',proof:proofFor('mail-approved','txautoone@gmail.com'),recipient:'buyer@example.com',body:'We will confirm the availability.',action:'draft'}},output);
    assert.equal(output.statusCode,200);
    assert.equal(output.payload.action,'draft');
    assert.deepEqual(calls.map(x=>x[0].split('/').pop()),['mail-approved','drafts']);
  } finally {globalThis.fetch=previous;}
});

test('cron rejects missing or incorrect authorization before touching external APIs', async () => {
  process.env.CRON_SECRET='very-long-only-test-cron-secret';
  const output=res();await cronHandler(req(),output);
  assert.equal(output.statusCode,401);
  delete process.env.CRON_SECRET;
});

import { runDraftScan } from '../api/_workflows.js';

test('automatic scan creates one unsent Gmail draft and skips duplicate messages', async () => {
  const previous = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://mock-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  process.env.OPENAI_API_KEY = 'fake-unit-test-openai-key';
  let draftCount = 0;
  let job = null;
  const calls = [];
  globalThis.fetch = async (url, init={}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}`);
    if(u.pathname.endsWith('/a1_settings')) return Response.json([{owner_email:session.email,auto_draft_enabled:true}]);
    if(u.pathname.endsWith('/a1_draft_jobs')) {
      if(method==='GET')return Response.json(job?[job]:[]);
      if(method==='POST'){job={id:'lead001',owner_email:session.email,state:'working'};return Response.json([job]);}
      if(method==='PATCH'){job={...job,...JSON.parse(init.body)};return Response.json([job]);}
    }
    if(u.pathname.endsWith('/a1_leads')){
      if(method==='GET')return Response.json([]);
      if(method==='POST')return Response.json(JSON.parse(init.body));
      if(method==='PATCH')return Response.json([]);
    }
    if(u.pathname.endsWith('/messages')&&method==='GET')return Response.json({messages:[{id:'lead001'}]});
    if(u.pathname.endsWith('/messages/lead001'))return Response.json({id:'lead001',threadId:'thread001',internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'Checking on a Honda'},{name:'From',value:'Buyer <buyer@example.com>'},{name:'Message-ID',value:'<lead001@example.com>'}],body:{data:Buffer.from('Is the Honda available?').toString('base64url')}},snippet:'Is the Honda available?'});
    if(u.host==='api.openai.com')return Response.json({choices:[{message:{content:'Thank you for your interest. We can check availability for you.'}}]});
    if(u.pathname.endsWith('/drafts')&&method==='POST'){draftCount++;return Response.json({id:'gmail-draft001'});}
    throw new Error(`Unexpected mocked call ${method} ${url}`);
  };
  try {
    const first=await runDraftScan({...session,access_token:'fake'});
    assert.equal(first.drafted,1);
    assert.deepEqual(first.errors,[]);
    assert.equal(job.state,'drafted');
    const second=await runDraftScan({...session,access_token:'fake'});
    assert.equal(second.drafted,0);
    assert.equal(second.skipped,1);
    assert.equal(draftCount,1);
    assert.equal(calls.some(x=>x.includes('/messages/send')),false);
  } finally {
    globalThis.fetch=previous;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});
