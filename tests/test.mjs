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
  const dirs = ['api','dashboard','inbox','analytics','settings'];
  const paths = dirs.flatMap(d => fs.readdirSync(path.join(dir,d)).filter(f=>f.endsWith('.js')).map(f=>path.join(dir,d,f)));
  paths.push(path.join(dir,'script.js'));
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
