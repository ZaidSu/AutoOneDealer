// Auto One Dealer browser application. No API keys or customer records live in this file.
const PAGES = [
  ['dashboard','Dashboard','home'],['inbox','Lead Inbox','mail'],['leads','Leads','users'],
  ['analytics','Analytics','chart'],['train-ai','Train Your AI','spark'],['templates','Templates','file'],
  ['automation','Automation','bolt'],['settings','Settings','settings']
];
const href = page => page === 'login' ? '/index.html' : `/${page}/${page}.html`;
const page = document.body.dataset.page || 'login';
const app = document.getElementById('app');
const S = { status:null, emails:[], lead:null, leads:[], templates:[], settings:null, currentPage:0, nextToken:null, pageTokens:[''], statusText:'', inboxError:'', storageWarning:'', stats:null, analytics:null };
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = ms => ms ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(ms)) : '—';
const dateOnly = date => new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const shortDate = date => date ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'America/Chicago'}).format(new Date(date+'T12:00:00Z')) : '—';
const dateInput = value => value ? new Date(value).toISOString().slice(0,16) : '';
const abbr = source => String(source||'?').split(/[\s.]/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase();
const badge = (value,cls='') => `<span class="badge ${cls}">${esc(value)}</span>`;
const safeLink = value => /^https:\/\//.test(value||'') ? value : '#';
const ICONS = {
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 11a3 3 0 0 0 0-6m2 15h2v-2a6 6 0 0 0-4-5.65"/>',
  chart:'<path d="M4 20V4m0 16h16M8 16v-5m5 5V6m5 10V9"/>',
  spark:'<path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/>',
  file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h7"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l-1.9 1.9a1.6 1.6 0 0 0-1.8-.3l-1 .5-.2 2.1h-2.7l-.2-2.1-1-.5a1.6 1.6 0 0 0-1.8.3l-1.9-1.9a1.6 1.6 0 0 0 .3-1.8l-.5-1-2.1-.2v-2.7l2.1-.2.5-1a1.6 1.6 0 0 0-.3-1.8l1.9-1.9a1.6 1.6 0 0 0 1.8.3l1-.5.2-2.1h2.7l.2 2.1 1 .5a1.6 1.6 0 0 0 1.8-.3l1.9 1.9a1.6 1.6 0 0 0-.3 1.8l.5 1 2.1.2v2.7l-2.1.2z"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 10a7 7 0 0 1 12-3l3 5M4 12l3 5a7 7 0 0 0 12-3"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.file}</svg>`;
async function api(route, opts) {
  const response = await fetch('/api/'+route,{cache:'no-store',credentials:'same-origin',...opts,headers:{'Accept':'application/json',...(opts?.body?{'Content-Type':'application/json'}:{}),...opts?.headers}});
  let body = {};try{body=await response.json();}catch{}
  if(!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
const post = (route,body,method='POST') => api(route,{method,body:JSON.stringify(body)});
let toastTimer;
function notify(message, type='success') {
  $('.toast')?.remove();
  const el=document.createElement('div');el.className='toast '+(type==='error'?'error':'');el.textContent=message;el.setAttribute('role','status');
  document.body.appendChild(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),6500);
}
const errorText = err => String(err?.message || 'Something went wrong.');
function banner(text,type='info'){return `<div class="banner ${type}" role="status">${esc(text)}</div>`;}
function empty(title,body,action=''){return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(body)}</p>${action?`<div style="margin-top:16px">${action}</div>`:''}</div>`;}
function loading(msg='Loading live information…'){return `<div class="empty"><p>${esc(msg)}</p></div>`;}
function heading(title,subtitle,actions='') {return `<header class="page-head"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="head-actions">${actions}</div></header>`;}
function shell(inner){
  const nav=PAGES.map(([id,title,ic])=>`<a class="nav-link ${id===page?'active':''}" ${id===page?'aria-current="page"':''} href="${href(id)}">${icon(ic)}<span>${esc(title)}</span></a>`).join('');
  const layout=`<div class="app" id="layout"><div class="mobile-shade" id="shade"></div><aside class="sidebar" id="sidebar"><a class="brand-link" href="${href('dashboard')}"><span class="brand-symbol">A1</span><span class="brand-copy"><b>Auto One</b><small>DEALER SYSTEM</small></span></a><div class="nav-group"><div class="nav-label">WORKSPACE</div>${nav}</div><div class="side-bottom"><div class="side-status"><span class="dot ${S.status?.connected?'online':'offline'}"></span>${esc(S.status?.connected?'Gmail connected':'Gmail disconnected')}</div><button class="logout" type="button" id="logout">Disconnect &amp; sign out</button></div></aside><div><div class="mobile-top"><button type="button" id="menu" class="menu-btn" aria-label="Open navigation" aria-expanded="false">☰</button><a href="${href('dashboard')}">AUTO ONE DEALER</a><span class="dot ${S.status?.connected?'online':'offline'}" aria-label="Gmail status"></span></div><main class="main" id="content">${inner}</main></div></div>`;
  app.innerHTML=layout;
  $('#menu')?.addEventListener('click',()=>{const open=$('#layout').classList.toggle('nav-open');$('#menu').setAttribute('aria-expanded',String(open));});
  $('#shade')?.addEventListener('click',()=>{ $('#layout').classList.remove('nav-open');$('#menu').setAttribute('aria-expanded','false'); });
  $('#logout')?.addEventListener('click',async()=>{try{const result=await post('disconnect',{});if(result.warnings?.length)window.alert('Signed out, but check these warnings: '+result.warnings.join(' '));location.href=href('login');}catch(e){notify(errorText(e),'error');}});
}
function setContent(html){$('#content').innerHTML=html;}
function message(target,txt,type='error'){if($(target))$(target).innerHTML=txt?banner(txt,type):'';}
function buttonBusy(el,promise){if(!el)return promise;el.disabled=true;const label=el.textContent;el.textContent='Working…';return Promise.resolve(promise).finally(()=>{el.disabled=false;el.textContent=label;});}
async function login(){
  let status;
  try{status=await api('status');}catch(err){app.innerHTML=`<div class="login-pane">${banner(errorText(err),'error')}</div>`;return;}
  if(status.connected){location.replace(href('dashboard'));return;}
  const reason=new URLSearchParams(location.search).get('gmail');
  const explain={denied:'Google sign-in was cancelled.',invalid_state:'Google session expired. Try connecting again.',wrong_account:'Use the Gmail address approved in GMAIL_ALLOWED_EMAIL.',no_refresh_token:'Google did not return a refresh token. Remove access in Google account settings and reconnect.',connection_failed:'Connection failed. Check your Google OAuth credentials and redirect URI.'};
  app.innerHTML=`<div class="login-screen"><div class="login-art"><span class="eyebrow">AUTO ONE MOTORS / DEALER OS</span><h1>Every lead.<br><em>One place.</em></h1><p>Connect your dealership Gmail to manage inquiries, track conversations, draft AI-assisted replies and measure results.</p><span class="brand-symbol" style="margin-top:55px">A1</span></div><div class="login-pane"><div class="login-card"><span class="badge red">Authorized dealership access</span><h2>Welcome back</h2><p>Sign in securely using your approved Google account. No demo usernames or hardcoded passwords.</p>${reason && explain[reason]?banner(explain[reason],'error'):''}<a class="btn" href="/api/google-login">Connect with Google ${icon('arrow')}</a><div class="login-hint">Gmail access starts with your approved email address. The system uses secure, HTTP-only session cookies. It never exposes your Google or OpenAI API keys to the browser.</div></div></div></div>`;
}
function statusChip(){return `<span class="chip ${S.status?.connected?'live':'off'}">${S.status?.connected?'● Gmail connected':'● Gmail disconnected'}</span>`;}
async function dashboard(){
  shell(heading('Good to see you','Your dealership inbox and lead activity, using live Gmail data.',statusChip()+`<a href="${href('inbox')}" class="btn">Open Inbox ${icon('arrow')}</a>`)+`<div id="dash-message"></div><div class="hero"><div class="hero-content"><span class="eyebrow">AUTO ONE MOTORS</span><h2>Every customer inquiry deserves a timely response.</h2><p>Your live lead inbox, pipeline and reply drafts in one organized workspace.</p><a class="btn" href="${href('inbox')}">Review lead emails ${icon('arrow')}</a></div></div><div class="grid cols-4" id="dash-stats">${loading()}</div><div class="grid split" style="margin-top:16px"><section class="card"><div class="card-head"><div><h2>Recent lead emails</h2><p>Newest messages from approved Gmail lead sources.</p></div><a class="btn outline small" href="${href('inbox')}">See inbox</a></div><div id="dash-recent">${loading()}</div></section><div class="grid"><section class="card"><h2>System status</h2><div id="dash-system">${loading()}</div></section><section class="card"><h2>Need to update the AI?</h2><p>Keep dealership details, financing guidelines and reply tone up to date before generating customer replies.</p><a style="margin-top:17px" class="btn soft" href="${href('train-ai')}">Train Your AI</a></section></div></div>`);
  $('#dash-system').innerHTML=`<div class="kv"><span>Gmail</span><b>${S.status.connected?'Connected':'Not connected'}</b></div><div class="kv"><span>AI drafts</span><b>${S.status.ai?'API configured':'Needs OPENAI_API_KEY'}</b></div><div class="kv"><span>Lead database</span><b>${S.status.database?'Supabase configured':'Needs Supabase'}</b></div><div class="kv"><span>Compose access</span><b>${S.status.canCompose?'Granted':'Reconnect to grant'}</b></div>`;
  const result=await Promise.allSettled([api('overview'),api('leads'),api('emails?max=5')]);
  const [metrics,leadData,mailData]=result.map(x=>x.status==='fulfilled'?x.value:null);
  const errors=result.filter(x=>x.status==='rejected').map(x=>errorText(x.reason));
  if(errors.length)message('#dash-message',errors[0]);
  const open=leadData?.configured?leadData.leads.filter(x=>!['won','lost'].includes(x.status)).length:'—';
  const count=leadData?.configured ? 'Tracked leads currently open' : 'Connect Supabase for pipeline';
  $('#dash-stats').innerHTML=`<div class="card stat"><span class="label">Leads today</span><strong>${metrics?.today??'—'}</strong><small>Live matched lead emails</small></div><div class="card stat"><span class="label">This month</span><strong>${metrics?.month??'—'}</strong><small>Since the first of this month</small></div><div class="card stat"><span class="label">Unread this month</span><strong>${metrics?.unreadMonth??'—'}</strong><small>Unread messages from approved lead senders</small></div><div class="card stat accent"><span class="label">Open tracked leads</span><strong>${open}</strong><small>${count}</small></div>`;
  if(mailData?.storageWarning) message('#dash-message',mailData.storageWarning);
  $('#dash-recent').innerHTML=mailData?.emails?.length?`<div class="row-list">${mailData.emails.map(x=>`<a class="lead-row" href="${href('inbox')}"><span class="avatar">${esc(abbr(x.source))}</span><span class="row-main"><span class="row-title">${esc(x.subject)}</span><small>${esc(x.from)} · ${fmtDate(x.date)}</small></span>${badge(x.source)}</a>`).join('')}</div>`:empty('No recent lead emails','If you are expecting leads, check the sender filter in Settings and your Gmail connection.');
}
function emailFilters(){return `<div class="card" style="margin-bottom:15px"><div class="filters"><div class="field"><label for="email-search">Search this page</label><input class="input" type="search" id="email-search" placeholder="Subject, sender, message or vehicle"></div><div class="field"><label for="source-filter">Lead source</label><select id="source-filter"><option value="">All sources</option><option>Cars.com</option><option>CarZing</option><option>Credit Union of Texas</option><option>Other lead</option></select></div><div class="field"><label for="status-filter">Status</label><select id="status-filter"><option value="">All statuses</option><option>new</option><option>read</option><option>contacted</option><option>drafted</option><option>appointment</option><option>won</option><option>lost</option></select></div></div><p class="form-note" style="margin-top:10px">Search and filters apply to the current Gmail page. Use Next page to browse older messages.</p></div>`;}
async function inbox(){
  shell(heading('Lead Inbox','Read real lead emails, generate suggested replies, then save a Gmail draft or send after reviewing.',statusChip()+`<button class="btn outline" id="refresh-email">${icon('refresh')} Refresh</button>`)+`<div id="inbox-message"></div>${emailFilters()}<div class="inbox-layout"><section class="card email-list"><div class="email-list-header between"><h2>Lead emails</h2><span class="badge" id="inbox-count">Loading</span></div><div id="email-items">${loading()}</div><div class="pager"><span class="muted" id="page-text">Page 1</span><div class="flex" style="gap:7px"><button type="button" class="btn outline small" id="prev-page">Previous</button><button type="button" class="btn outline small" id="next-page">Next</button></div></div></section><section class="card detail" id="email-detail">${empty('Select a lead email','Choose a message on the left to view its contents and work on a reply.')}</section></div>`);
  $('#refresh-email').addEventListener('click',()=>loadEmailPage(0));
  $('#prev-page').addEventListener('click',()=>loadEmailPage(S.currentPage-1));
  $('#next-page').addEventListener('click',()=>loadEmailPage(S.currentPage+1));
  ['#email-search','#source-filter','#status-filter'].forEach(id=>$(id).addEventListener('input',drawEmailList));
  await loadEmailPage(0);
}
async function loadEmailPage(index){
  if(index<0 || (index>0&&!S.pageTokens[index]))return;
  S.currentPage=index; S.lead=null;
  $('#email-items').innerHTML=loading('Loading Gmail lead messages…');$('#email-detail').innerHTML=empty('Select a lead email','Choose a message to read and reply.');
  message('#inbox-message','');
  try {
    const data=await api('emails?max=30'+(S.pageTokens[index]?'&pageToken='+encodeURIComponent(S.pageTokens[index]):''));
    S.emails=data.emails||[];S.nextToken=data.nextPageToken;
    if(S.nextToken)S.pageTokens[index+1]=S.nextToken; else S.pageTokens.length=index+1;
    S.storageWarning=data.storageWarning||'';
    if(S.storageWarning)message('#inbox-message',S.storageWarning);
    else if(!data.storageEnabled)message('#inbox-message','Gmail is connected. Lead statuses and notes will not persist until Supabase is configured.','info');
    drawEmailList();
  } catch(err){S.emails=[];S.nextToken=null;message('#inbox-message',errorText(err));drawEmailList();}
}
function drawEmailList(){
  const search=$('#email-search').value.trim().toLowerCase(),source=$('#source-filter').value,status=$('#status-filter').value;
  const list=S.emails.filter(x=>(!search||[x.subject,x.from,x.snippet,x.body].join(' ').toLowerCase().includes(search))&&(!source||x.source===source)&&(!status||x.status===status));
  $('#inbox-count').textContent=`${list.length} shown`;
  $('#email-items').innerHTML=list.length?list.map(x=>`<button type="button" class="email-item ${S.lead?.id===x.id?'selected':''}" data-email="${esc(x.id)}"><div class="email-meta"><b>${x.unread?'● ':''}${esc(x.from)}</b><small>${fmtDate(x.date)}</small></div><span class="subject">${esc(x.subject)}</span><span class="snippet">${esc(x.snippet||x.body)}</span><div class="email-tags">${badge(x.source)} ${badge(x.status,x.status==='new'?'red':x.status==='drafted'?'blue':'')}</div></button>`).join(''):empty('No matching emails',S.emails.length?'Try clearing the filters.':'No lead messages were returned by the configured Gmail filter.');
  $$('#email-items [data-email]').forEach(el=>el.addEventListener('click',()=>selectEmail(el.dataset.email)));
  $('#page-text').textContent=`Gmail page ${S.currentPage+1}`;
  $('#prev-page').disabled=S.currentPage===0;
  $('#next-page').disabled=!S.nextToken;
}
async function selectEmail(id){
  const item=S.emails.find(x=>x.id===id);if(!item)return;
  S.lead=item;drawEmailList();
  $('#email-detail').innerHTML=loading('Loading email details…');
  try { const result=await api('email?id='+encodeURIComponent(id)+'&proof='+encodeURIComponent(item.proof));S.lead={...item,...result.email,status:item.status}; }
  catch(err){message('#inbox-message',errorText(err));S.lead=item;}
  if (S.lead?.id === id) drawDetail();
}
function drawDetail(){
  const e=S.lead;if(!e)return;
  const suggested=e.replyTo||e.from||'';
  const address=/<([^<>\s]+@[^<>\s]+)>/.exec(suggested)?.[1]||/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(suggested)?.[0]||'';
  const compose=S.status.canCompose;
  $('#email-detail').innerHTML=`<div class="between"><span class="badge red">${esc(e.source)}</span><small>${fmtDate(e.date)}</small></div><h2 style="font-size:20px;margin:15px 0 9px;line-height:1.35">${esc(e.subject)}</h2><div class="detail-metadata"><span><b>From:</b> ${esc(e.from)}</span><span><b>To:</b> ${esc(e.to)}</span>${e.replyTo?`<span><b>Reply-To:</b> ${esc(e.replyTo)}</span>`:''}</div><div class="detail-body" id="incoming-body">${esc(e.body)}</div><div class="between" style="margin-top:12px"><h3 style="margin:0">Your reply</h3><a class="btn soft small" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(e.threadId)}" target="_blank" rel="noopener noreferrer">Open in Gmail</a></div><div style="margin-top:13px" class="field"><label for="reply-to">Recipient — confirm this is the customer's address</label><input class="input" id="reply-to" type="email" value="${esc(address)}"></div><div class="field" style="margin-top:12px"><label for="reply-template">Start from a template</label><select id="reply-template"><option value="">Choose a template (optional)</option></select></div><div class="field" style="margin-top:12px"><label for="reply-body">Reply message</label><textarea id="reply-body" rows="9" placeholder="Write a reply or generate a suggestion. Review before sending."></textarea></div><div id="reply-message" style="margin-top:12px"></div><div class="form-actions"><button class="btn soft" id="generate-reply" ${!S.status.ai?'disabled title="Set OPENAI_API_KEY first"':''}>${icon('spark')} Generate AI reply</button><button class="btn outline" id="save-draft" ${!compose?'disabled title="Reconnect Gmail to grant compose access"':''}>Save Gmail draft</button><button class="btn" id="send-reply" ${!compose?'disabled title="Reconnect Gmail to grant compose access"':''}>Review &amp; send</button></div>${!compose?banner('Gmail compose permission is missing. Reconnect your Google account in Settings to save drafts or send.','info'):''}<p class="form-note">AI-generated text may be incorrect. Confirm inventory, financing, customer identity and recipient before sending. No reply is sent automatically.</p>`;
  $('#reply-template').addEventListener('change',e=>{const template=S.templates.find(t=>t.slug===e.target.value);if(template)$('#reply-body').value=template.body;});
  $('#generate-reply').addEventListener('click',async ev=>{
    try{const template=S.templates.find(t=>t.slug===$('#reply-template').value)?.body||'';
      const data=await buttonBusy(ev.currentTarget,post('generate-reply',{id:S.lead.id,proof:S.lead.proof,template}));
      $('#reply-body').value=data.reply;message('#reply-message','Generated a suggestion. Verify every claim before sending.','success');
    }catch(err){message('#reply-message',errorText(err));}
  });
  $('#save-draft').addEventListener('click',ev=>replyAction('draft',ev.currentTarget));
  $('#send-reply').addEventListener('click',ev=>replyAction('send',ev.currentTarget));
  loadReplyTemplates();
}
async function loadReplyTemplates(){
  try { if(!S.templates.length){S.templates=(await api('templates')).templates||[];}
    if(!$('#reply-template'))return;
    $('#reply-template').insertAdjacentHTML('beforeend',S.templates.map(t=>`<option value="${esc(t.slug)}">${esc(t.title)}</option>`).join(''));
  }catch(err){message('#reply-message','Templates unavailable: '+errorText(err),'info');}
}
async function replyAction(action,button){
  const id=S.lead?.id,proof=S.lead?.proof,to=$('#reply-to')?.value?.trim(),body=$('#reply-body')?.value?.trim();
  if(!id||!body||!to){message('#reply-message','Enter a recipient and a message first.');return;}
  if(action==='send'&&!window.confirm(`Send this reply to ${to}? Confirm the customer address and all vehicle/finance details before continuing.`))return;
  try {await buttonBusy(button,post('reply',{id,proof,recipient:to,body,action,confirmed:action==='send'}));
    message('#reply-message',action==='draft'?'Gmail draft saved. Open the conversation in Gmail to review it.':'Reply sent successfully through the connected Gmail account.','success');
    S.lead.status=action==='draft'?'drafted':'contacted';
    const current=S.emails.find(x=>x.id===id);if(current)current.status=S.lead.status;drawEmailList();
  }catch(err){message('#reply-message',errorText(err));}
}
const STATUSES=['new','contacted','drafted','appointment','won','lost'];
function statusOptions(current){return STATUSES.map(x=>`<option ${x===current?'selected':''} value="${x}">${x.replace(/^./,c=>c.toUpperCase())}</option>`).join('');}
async function leads(){
  shell(heading('Leads','Track real Gmail inquiries, update their stage and plan follow-ups.',statusChip()+`<a href="${href('inbox')}" class="btn">Review inbox</a>`)+`<div id="leads-message"></div><div class="grid cols-3" id="lead-stats">${loading()}</div><div class="grid split" style="margin-top:15px"><section class="card"><div class="card-head"><div><h2>Tracked lead pipeline</h2><p>Lead messages found in your inbox and synced into Supabase.</p></div><span class="badge" id="lead-count">—</span></div><div class="field" style="margin-bottom:12px"><label for="lead-search">Search leads</label><input class="input" id="lead-search" type="search" placeholder="Customer email, vehicle, subject"></div><div class="table-wrap" id="leads-table">${loading()}</div></section><section class="card" id="lead-editor">${empty('Select a lead','Pick a lead to update its stage, add notes or schedule a follow-up.')}</section></div>`);
  $('#lead-search').addEventListener('input',drawLeadsTable);
  await loadLeads();
}
async function loadLeads(){
  try {const result=await api('leads');S.leads=result.leads||[];
    if(!result.configured){message('#leads-message','Supabase is not set up. Add its server-side variables and run supabase/schema.sql. Gmail Inbox will still work.','info');}
    drawLeadsTable();
    const count = status=>S.leads.filter(x=>x.status===status).length;
    $('#lead-stats').innerHTML=`<div class="card stat"><span class="label">All tracked leads</span><strong>${result.configured?S.leads.length:'—'}</strong><small>Up to 200 most recent</small></div><div class="card stat"><span class="label">New</span><strong>${result.configured?count('new'):'—'}</strong><small>Awaiting first contact</small></div><div class="card stat"><span class="label">Appointments</span><strong>${result.configured?count('appointment'):'—'}</strong><small>Lead stage in your pipeline</small></div>`;
    $('#lead-count').textContent=result.configured?S.leads.length+' leads':'Database not ready';
  }catch(err){message('#leads-message',errorText(err));$('#leads-table').innerHTML=empty('Unable to load leads',errorText(err));}
}
function drawLeadsTable(){
  const q=$('#lead-search').value.trim().toLowerCase();
  const list=S.leads.filter(x=>[x.sender,x.subject,x.source,x.notes].join(' ').toLowerCase().includes(q));
  $('#leads-table').innerHTML=list.length?`<table class="data-table"><thead><tr><th>Lead</th><th>Source</th><th>Stage</th><th>Received</th></tr></thead><tbody>${list.map(x=>`<tr data-lead="${esc(x.id)}" class="${S.lead?.id===x.id?'selected':''}"><td><b>${esc(x.subject)}</b><small>${esc(x.sender)}</small></td><td>${badge(x.source)}</td><td>${badge(x.status,x.status==='new'?'red':x.status==='appointment'?'green':'')}</td><td>${fmtDate(x.received_at)}</td></tr>`).join('')}</tbody></table>`:empty('No leads found','Load the lead inbox to sync real inquiries, or change your search.');
  $$('#leads-table [data-lead]').forEach(el=>el.addEventListener('click',()=>selectLead(el.dataset.lead)));
}
function selectLead(id){
  S.lead=S.leads.find(x=>x.id===id);if(!S.lead)return;drawLeadsTable();
  const x=S.lead;
  $('#lead-editor').innerHTML=`<div class="card-head"><div><h2>${esc(x.subject)}</h2><p>${esc(x.sender)} · ${esc(x.source)}</p></div>${badge(x.status)}</div><div class="field"><label for="stage">Lead stage</label><select id="stage">${statusOptions(x.status)}</select></div><div class="field" style="margin-top:15px"><label for="follow-up">Follow-up date/time</label><input class="input" type="datetime-local" id="follow-up" value="${dateInput(x.follow_up_at)}"></div><div class="field" style="margin-top:15px"><label for="lead-notes">Notes</label><textarea id="lead-notes" rows="7" placeholder="What did the customer ask? What is the next step?">${esc(x.notes||'')}</textarea></div><div id="edit-message"></div><div class="form-actions"><button class="btn" id="save-lead">Save lead</button><a class="btn outline" href="${href('inbox')}">Open inbox</a></div>`;
  $('#save-lead').addEventListener('click',async ev=>{
    const follow=$('#follow-up').value;
    try{const result=await buttonBusy(ev.currentTarget,post('leads',{id:x.id,proof:x.proof,status:$('#stage').value,notes:$('#lead-notes').value,follow_up_at:follow?new Date(follow).toISOString():null}));
      const idx=S.leads.findIndex(y=>y.id===x.id);S.leads[idx]={...result.lead,proof:x.proof};S.lead=S.leads[idx];drawLeadsTable();message('#edit-message','Lead updated.','success');
    }catch(err){message('#edit-message',errorText(err));}
  });
}
async function analytics(){
  const today=dateOnly(new Date());const last=new Date();last.setDate(last.getDate()-13);
  shell(heading('Analytics','Actual Gmail lead counts for the date range you choose.',statusChip())+`<div id="analytics-message"></div><section class="card" style="margin-bottom:16px"><form id="date-form" class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="field"><label for="start-date">Start date</label><input class="input" type="date" id="start-date" value="${dateOnly(last)}" required></div><div class="field"><label for="end-date">End date</label><input class="input" type="date" id="end-date" value="${today}" required></div><div class="form-actions" style="grid-column:1/-1;margin-top:0"><button class="btn" type="submit" id="run-report">Generate report</button><button type="button" class="btn outline small" id="last-seven">Last 7 days</button><button type="button" class="btn outline small" id="last-month">Last 30 days</button></div></form></section><div class="grid cols-3" id="analytics-stats">${loading()}</div><section class="card" style="margin-top:16px"><div class="card-head"><div><h2>Lead volume over time</h2><p>Counts come from approved lead sources in your Gmail account.</p></div><span class="badge" id="bucket-mode">—</span></div><div id="analytics-chart">${loading()}</div></section><p class="footer-note">Date boundaries use America/Chicago, including daylight saving changes. Totals include archived approved lead emails.</p>`);
  $('#date-form').addEventListener('submit',async ev=>{ev.preventDefault();await loadAnalytics();});
  const shortcut=n=>{const d=new Date();d.setDate(d.getDate()-(n-1));$('#start-date').value=dateOnly(d);$('#end-date').value=dateOnly(new Date());loadAnalytics();};
  $('#last-seven').addEventListener('click',()=>shortcut(7));$('#last-month').addEventListener('click',()=>shortcut(30));
  await loadAnalytics();
}
async function loadAnalytics(){
  const start=$('#start-date').value,end=$('#end-date').value;
  if(!start||!end||end<start){message('#analytics-message','Choose a valid start and end date.');return;}
  message('#analytics-message','');$('#analytics-chart').innerHTML=loading('Counting matched Gmail messages…');
  try{const data=await api('analytics?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end));S.analytics=data;
    const counts=data.buckets.map(x=>x.count),max=Math.max(1,...counts),avg=data.days?data.total/data.days:0;
    $('#analytics-stats').innerHTML=`<div class="card stat"><span class="label">Total leads</span><strong>${data.total.toLocaleString()}</strong><small>Exact Gmail count</small></div><div class="card stat"><span class="label">Days measured</span><strong>${data.days}</strong><small>${esc(data.start)} through ${esc(data.end)}</small></div><div class="card stat accent"><span class="label">Daily average</span><strong>${avg.toFixed(1)}</strong><small>Matched lead emails per day</small></div>`;
    $('#bucket-mode').textContent=data.mode+'ly buckets';
    $('#analytics-chart').innerHTML=data.buckets.length?`<div class="chart" role="img" aria-label="Lead counts over selected dates">${data.buckets.map(b=>`<div class="bar-col" title="${esc(b.start)}: ${b.count} leads"><small>${b.count||''}</small><div class="bar" style="height:${Math.max(2,Math.round(b.count/max*170))}px"></div><small>${shortDate(b.start)}</small></div>`).join('')}</div><div class="chart-summary"><span class="muted">${data.buckets.length} ${esc(data.mode)} buckets</span><strong>${data.total.toLocaleString()} leads</strong></div>`:empty('No data','No leads were found in this date range.');
  }catch(err){message('#analytics-message',errorText(err));$('#analytics-stats').innerHTML='';$('#analytics-chart').innerHTML=empty('Could not load analytics',errorText(err));}
}
async function training(){
  shell(heading('Train Your AI','Your dealership facts and response rules are used when generating draft replies.',statusChip()+`<a href="${href('inbox')}" class="btn outline">Try in inbox</a>`)+`<div id="train-message"></div><form id="training-form" class="grid split"><section class="card"><div class="card-head"><div><h2>Dealership details</h2><p>Only enter confirmed information the AI is allowed to mention.</p></div></div><div class="form-grid"><div class="field"><label for="business_name">Business name</label><input class="input" id="business_name" maxlength="120"></div><div class="field"><label for="phone">Business phone</label><input class="input" id="phone" maxlength="90" placeholder="Only if confirmed"></div><div class="field"><label for="website">Website</label><input class="input" id="website" maxlength="250" placeholder="https://..."></div><div class="field"><label for="hours">Business hours</label><input class="input" id="hours" maxlength="900" placeholder="Your verified hours"></div><div class="field" style="grid-column:1/-1"><label for="address">Dealership address</label><input class="input" id="address" maxlength="500" placeholder="Your verified business address"></div></div><div class="field" style="margin-top:15px"><label for="tone">Reply tone</label><textarea id="tone" rows="3" maxlength="500"></textarea></div><div class="field" style="margin-top:15px"><label for="ai_instructions">Extra AI instructions</label><textarea id="ai_instructions" rows="6" maxlength="6000"></textarea></div></section><div class="grid"><section class="card"><h2>Financing guidelines</h2><p>Use only approved statements; never guarantee approval or quote unsupported terms.</p><textarea id="finance_rules" style="margin-top:14px" rows="7" maxlength="3000"></textarea></section><section class="card"><h2>Always require human review</h2><p>Explain which requests need a dealership employee to confirm details.</p><textarea id="sensitive_topics" style="margin-top:14px" rows="6" maxlength="3000"></textarea></section><section class="card"><p>All training details are saved in your private Supabase database, not in browser-only storage.</p><button type="submit" id="save-training" class="btn" style="margin-top:15px">Save AI knowledge</button></section></div></form>`);
  $('#training-form').addEventListener('submit',async ev=>{ev.preventDefault();await saveFields(ev.currentTarget,'#train-message','#save-training');});
  await loadSettingsIntoForm('#train-message');
}
const settingFields=['business_name','phone','website','hours','address','tone','ai_instructions','finance_rules','sensitive_topics'];
async function loadSettingsIntoForm(target){
  try{const data=await api('settings');S.settings=data.settings;
    settingFields.forEach(field=>{if($('#'+field))$('#'+field).value=data.settings[field]||'';});
    if(!data.configured)message(target,'You can view starter guidance, but you need Supabase to save changes. See README and supabase/schema.sql.','info');
  }catch(err){message(target,errorText(err));}
}
async function saveFields(form,target,buttonSel){
  const changes=Object.fromEntries(settingFields.filter(field=>$('#'+field,form)).map(field=>[field,$('#'+field,form).value]));
  try{const result=await buttonBusy($(buttonSel),post('settings',changes));S.settings=result.settings;message(target,'Saved successfully. New AI drafts will use these instructions.','success');}
  catch(err){message(target,errorText(err));}
}
async function templates(){
  shell(heading('Response templates','Create reusable customer replies and use them as the starting point for Gmail drafts.',statusChip()+`<button id="new-template" class="btn">${icon('plus')} New template</button>`)+`<div id="templates-message"></div><div class="template-grid" id="template-list">${loading()}</div><section class="card hidden" id="template-editor" style="margin-top:18px"><div class="card-head"><div><h2 id="template-editor-title">Edit template</h2><p>These are suggested text snippets. Confirm all facts before sending.</p></div><button class="btn outline small" type="button" id="close-template">Close</button></div><form id="template-form"><input type="hidden" id="template-slug"><div class="form-grid"><div class="field"><label for="template-title">Template title</label><input class="input" id="template-title" maxlength="100" required></div><div class="field"><label for="template-category">Category</label><input class="input" id="template-category" maxlength="60" required></div></div><div class="field" style="margin-top:14px"><label for="template-body">Reply text</label><textarea id="template-body" rows="10" maxlength="8000" required></textarea></div><div id="template-form-message"></div><div class="form-actions"><button type="submit" class="btn" id="template-save">Save template</button><button type="button" class="btn danger" id="template-delete">Delete custom template</button></div></form></section>`);
  $('#new-template').addEventListener('click',()=>editTemplate(null));
  $('#close-template').addEventListener('click',()=>$('#template-editor').classList.add('hidden'));
  $('#template-form').addEventListener('submit',saveTemplate);
  $('#template-delete').addEventListener('click',deleteTemplate);
  await loadTemplates();
}
async function loadTemplates(){
  try {const data=await api('templates');S.templates=data.templates||[];
    if(!data.configured)message('#templates-message','Starter templates are available to preview. Connect Supabase to save edits or create new templates.','info');
    $('#template-list').innerHTML=S.templates.map(t=>`<div class="card template-card"><div class="between">${badge(t.category,t.category==='Financing'?'orange':'')}${t.starter?badge('Starter'):badge('Saved','green')}</div><h2 style="font-size:18px;margin:14px 0 7px">${esc(t.title)}</h2><p>${esc(t.body.slice(0,170))}${t.body.length>170?'…':''}</p><div class="form-actions"><button type="button" class="btn outline small" data-preview="${esc(t.slug)}">Preview / Edit</button></div></div>`).join('');
    $$('[data-preview]').forEach(el=>el.addEventListener('click',()=>editTemplate(S.templates.find(t=>t.slug===el.dataset.preview))));
  }catch(err){message('#templates-message',errorText(err));$('#template-list').innerHTML=empty('Templates unavailable',errorText(err));}
}
function editTemplate(t){
  $('#template-editor').classList.remove('hidden');
  $('#template-editor-title').textContent=t?'Edit / preview template':'Create a new template';
  $('#template-slug').value=t?.slug||'';$('#template-title').value=t?.title||'';$('#template-category').value=t?.category||'General';$('#template-body').value=t?.body||'';
  $('#template-delete').classList.toggle('hidden',!t);
  $('#template-delete').textContent=t?.slug&&['new-lead','financing','availability','appointment'].includes(t.slug)?'Restore starter template':'Delete custom template';
  message('#template-form-message','');$('#template-editor').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveTemplate(ev){ev.preventDefault();
  const payload={slug:$('#template-slug').value,title:$('#template-title').value,category:$('#template-category').value,body:$('#template-body').value};
  try {const result=await buttonBusy($('#template-save'),post('templates',payload));
    message('#template-form-message','Template saved to Supabase.','success');await loadTemplates();$('#template-slug').value=result.template.slug;
  }catch(err){message('#template-form-message',errorText(err));}
}
async function deleteTemplate(){
  const slug=$('#template-slug').value;if(!slug)return;
  const starter=['new-lead','financing','availability','appointment'].includes(slug);
  if(!window.confirm(starter?'Restore the original starter text for this template?':'Permanently delete this custom template?'))return;
  try{await post('templates',{slug},'DELETE');$('#template-editor').classList.add('hidden');await loadTemplates();notify(starter?'Starter template restored.':'Template deleted.');}
  catch(err){message('#template-form-message',errorText(err));}
}
async function automation(){
  shell(heading('Automation','Generate unsent drafts for approved leads. All customer replies require staff approval before sending.',statusChip())+`<div id="auto-message"></div><div class="grid cols-2"><section class="card"><div class="card-head"><div><h2>Automatic draft generation</h2><p>Scans recent approved Gmail leads and creates unsent drafts when enabled.</p></div>${badge('Safe mode','green')}</div><div class="switch-line"><div><h3>Enable draft generation</h3><p>Stores this setting in Supabase.</p></div><input type="checkbox" id="auto-draft" aria-label="Enable automatic drafts"></div><div class="form-actions"><button type="button" class="btn" id="save-auto">Save preference</button><button type="button" class="btn outline" id="run-auto">Run draft scan now</button></div><p class="form-note" style="margin-top:13px">Processes up to 5 previously unseen messages per run from the newest 15 approved lead emails received in the last 7 days. Saved Gmail drafts are never sent automatically.</p></section><section class="card"><h2>Automatic sending</h2><div class="switch-line"><div><h3>Off — human review required</h3><p>Drafts stay in Gmail for your team to review and send. Auto-send is intentionally not enabled.</p></div><input type="checkbox" disabled aria-label="Automatic sending unavailable"></div><h3 style="margin-top:20px">Sensitive requests</h3><p>Verify prices, inventory, loan terms, financing approvals, disputes and any other customer commitments before sending.</p></section></div><section class="card" style="margin-top:16px"><div class="card-head"><div><h2>Service readiness</h2><p>Each required service must be available before automatic draft generation can run.</p></div></div><div id="auto-services"></div></section><section class="card" style="margin-top:16px"><h2>Draft workflow</h2><div class="workflow" style="margin-top:17px"><span>Approved Gmail lead</span><i>→</i><span>Check duplicate</span><i>→</i><span>Generate safe draft</span><i>→</i><span>Save to Gmail</span><i>→</i><span>Staff review</span></div></section>`);
  $('#auto-services').innerHTML=`<div class="kv"><span>Gmail connected</span>${badge(S.status.connected?'Ready':'Not connected',S.status.connected?'green':'red')}</div><div class="kv"><span>Gmail compose scope</span>${badge(S.status.canCompose?'Ready':'Reconnect Gmail',S.status.canCompose?'green':'red')}</div><div class="kv"><span>OpenAI API key</span>${badge(S.status.ai?'Configured':'Missing',S.status.ai?'green':'red')}</div><div class="kv"><span>Supabase storage</span>${badge(S.status.database?'Configured':'Missing',S.status.database?'green':'red')}</div><div class="kv"><span>Daily scheduler (CRON_SECRET)</span>${badge(S.status.cron?'Configured':'Manual only',S.status.cron?'green':'orange')}</div>`;
  $('#save-auto').addEventListener('click',async ev=>{
    try{await buttonBusy(ev.currentTarget,post('settings',{auto_draft_enabled:$('#auto-draft').checked}));message('#auto-message','Draft generation preference saved.','success');}
    catch(err){message('#auto-message',errorText(err));}
  });
  $('#run-auto').addEventListener('click',async ev=>{
    if(!window.confirm('Scan up to 15 recent lead emails and save up to 5 new UNSENT drafts in Gmail?'))return;
    try{const data=await buttonBusy(ev.currentTarget,post('run-automation',{}));
      message('#auto-message',`Checked ${data.checked} lead emails. Created ${data.drafted} Gmail drafts; skipped ${data.skipped}. ${data.errors.length?data.errors.join(' '):'No sending occurred.'}`,data.errors.length?'error':'success');
    }catch(err){message('#auto-message',errorText(err));}
  });
  try{const info=await api('settings');S.settings=info.settings;$('#auto-draft').checked=Boolean(info.settings.auto_draft_enabled);
    if(!info.configured)message('#auto-message','Supabase is required to save automation settings and prevent duplicate drafts.','info');
  }catch(err){message('#auto-message',errorText(err));}
}
async function settings(){
  const reason=new URLSearchParams(location.search).get('gmail');
  shell(heading('Settings','Manage your Google connection and check which services are ready.',statusChip())+`<div id="settings-message"></div><div class="grid cols-2"><section class="card"><h2>Google Gmail</h2><p>Your approved dealership mailbox is the only account allowed to use this system.</p><div class="kv"><span>Connection</span><b>${S.status.connected?'Connected':'Disconnected'}</b></div><div class="kv"><span>Gmail address</span><b>${esc(S.status.email||'Not connected')}</b></div><div class="kv"><span>Read inbox</span>${badge(S.status.connected?'Enabled':'Requires sign-in',S.status.connected?'green':'red')}</div><div class="kv"><span>Save drafts &amp; send</span>${badge(S.status.canCompose?'Enabled':'Reconnect to authorize',S.status.canCompose?'green':'orange')}</div><div class="form-actions"><a href="/api/google-login" class="btn">${S.status.connected?'Reconnect Google':'Connect Google'}</a>${S.status.connected?'<button type="button" class="btn outline" id="disconnect">Disconnect</button>':''}</div></section><section class="card"><h2>Service connections</h2><p>Keys are stored only in Vercel server environment variables. Their values are never displayed here.</p><div class="kv"><span>Supabase</span>${badge(S.status.database?'Configured':'Missing',S.status.database?'green':'orange')}</div><div class="kv"><span>OpenAI</span>${badge(S.status.ai?'Configured':'Missing',S.status.ai?'green':'orange')}</div><div class="kv"><span>Scheduled draft scan</span>${badge(S.status.cron?'Configured':'Manual mode',S.status.cron?'green':'orange')}</div><div class="kv"><span>Lead source filter</span>${badge(S.status.customFilter?'Custom env rule':'Default approved sources')}</div><div class="kv"><span>Google OAuth callback</span><b>/api/google-callback</b></div></section></div><section class="card" style="margin-top:16px"><h2>Approved Gmail sender filter</h2><p>This read-only server-side filter determines which email messages are visible in your lead inbox. Change LEAD_GMAIL_QUERY in Vercel to adjust approved sources securely.</p><div class="detail-body" style="max-height:none">${esc(S.status.leadQuery||'Connect your Gmail account to see the active filter.')}</div><p class="form-note">Never enter API keys, refresh tokens or other secrets into this page.</p></section><section class="card" style="margin-top:16px"><h2>Setup checklist</h2><p>Existing Google credentials are reused. If Gmail read access works but drafting is disabled, reconnect once to grant Gmail compose permission. For saved pipeline stages, templates and AI instructions, run the included supabase/schema.sql file.</p><div class="form-actions"><a class="btn outline" href="${href('train-ai')}">Edit AI training</a><a class="btn outline" href="${href('automation')}">Review automation</a></div></section>`);
  if(reason==='connected')message('#settings-message','Gmail connected. Your account is now authorized for the permissions granted in Google.','success');
  if(reason&&reason!=='connected')message('#settings-message',{wrong_account:'You used a Google account that does not match your approved mailbox.',no_refresh_token:'Google did not return a long-lived refresh token. Try reconnecting after revoking the app in Google Account settings.',invalid_state:'Connection session expired. Please connect again.',connection_failed:'Google connection failed. Check your callback URL and OAuth credentials.',denied:'Google access was cancelled.'}[reason]||'Google sign-in could not be completed.');
  $('#disconnect')?.addEventListener('click',async ev=>{
    if(!window.confirm('Disconnect Gmail and sign out of this browser?'))return;
    try{const result=await buttonBusy(ev.currentTarget,post('disconnect',{}));if(result.warnings?.length)window.alert('Signed out, but check these warnings: '+result.warnings.join(' '));location.href=href('login');}
    catch(err){message('#settings-message',errorText(err));}
  });
}
async function start(){
  if(page==='login'){await login();return;}
  try{S.status=await api('status');}
  catch(err){app.innerHTML=`<div class="login-pane">${banner('Cannot reach the API: '+errorText(err),'error')}<a href="${href('login')}">Return to sign in</a></div>`;return;}
  if(!S.status.connected&&page!=='settings'){location.replace(href('login'));return;}
  const screens={dashboard,inbox,leads,analytics,'train-ai':training,templates,automation,settings};
  try{await screens[page]();}
  catch(err){if(!$('#layout'))shell('');setContent(heading('Something went wrong','The page could not finish loading.')+banner(errorText(err),'error')+`<a class="btn" href="${href('settings')}">Check settings</a>`);}
}
start();
