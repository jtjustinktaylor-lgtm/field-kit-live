'use strict';
const $=id=>document.getElementById(id);
const inputs={
 tasks:[
  {id:'OP-013',title:'New office cleaning inquiry',kind:'New client',due:'Today',owner:'Back office',status:'todo',next:'Confirm the address and requested times before preparing a quote.',draft:'Thanks for reaching out. Could you confirm the site address, preferred cleaning days, and when you’d like to start? We’ll review availability and follow up.'},
  {id:'OP-014',title:'Move Tuesday’s cleaning',kind:'Schedule change',due:'Today',owner:'Owner',status:'approval',next:'Confirm crew coverage before anyone promises a new time.',draft:'Thanks for the heads-up. We’re checking crew availability and will confirm the new time once it’s approved.'},
  {id:'OP-015',title:'Restock cleaning supplies',kind:'Supplies',due:'Monday',owner:'Back office',status:'working',next:'Check the current stock and prepare a list for approval.'}
 ],
 invoices:[
  {id:'INV-1042',company:'Cedar Dental',amount:800,status:'overdue',date:'8 days overdue'},
  {id:'INV-1045',company:'Pineview Offices',amount:480,status:'overdue',date:'4 days overdue'},
  {id:'INV-1048',company:'Parkside Studio',amount:620,status:'open',date:'Due next Tuesday'},
  {id:'INV-1038',company:'Willow Clinic',amount:1600,status:'paid',date:'Paid Wednesday'},
  {id:'INV-1039',company:'King Street Co-op',amount:850,status:'paid',date:'Paid Thursday'}
 ],
 receipts:[
  {id:'RC-021',merchant:'Supply shop',amount:86.42,status:'match',note:'Proposed match: same merchant, amount and date as the sample expense.'},
  {id:'RC-022',merchant:'Fuel stop',amount:62.10,status:'missing',note:'An expense exists, but no receipt is in the sample export.'},
  {id:'RC-023',merchant:'Wash & Fold',amount:44,status:'match',note:'Proposed match: same merchant, amount and date as the sample expense.'}
 ]
};
const autoRules=[
 ['invoice','Prepare overdue invoice reminders'],
 ['receipt','Flag missing receipts and proposed matches'],
 ['task','Triage admin requests and pull out owner decisions']
];
function newAutopilot(){return {enabled:new Set(autoRules.map(([key])=>key)),queue:new Map(),history:[],message:''};}
let work=structuredClone(inputs), view=location.hash==='#autopilot'?'autopilot':'invoices', auto=newAutopilot();
const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
function item(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function block(tag,cls,...nodes){const el=item(tag,undefined,cls);el.append(...nodes);return el;}
function button(title,fn,cls='button light'){const el=item('button',title,cls);el.type='button';el.addEventListener('click',fn);return el;}
function badge(text,cls=''){return item('span',text,'pill '+cls);}
const unpaid=()=>work.invoices.filter(x=>x.status==='overdue');
const decisions=()=>unpaid().filter(x=>!x.reviewed);
const outstanding=()=>work.receipts.filter(x=>x.status==='missing'||!x.reviewed);
const errors=()=>outstanding().filter(x=>x.status==='missing');
const taskStatus={todo:'To do',working:'In progress',approval:'Needs owner',done:'Done'};
const pending=()=>work.tasks.filter(x=>x.status!=='done');
const count=(n,label,plural=label+'s')=>n+' '+(n===1?label:plural);
const sum=rows=>rows.reduce((n,r)=>n+r.amount,0);
function render(){
 $('metrics').replaceChildren(...[['Paid this week',money(sum(work.invoices.filter(x=>x.status==='paid')))],['Overdue',money(sum(unpaid()))],['Open review items',String(decisions().length+outstanding().length+pending().length)]].map(([title,value])=>block('article','metric',item('span',title),item('strong',value))));
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
 const content=$('view');content.replaceChildren(block('div','view-head',item('h2',view==='invoices'?'Invoice review':view==='receipts'?'Receipt review':view==='tasks'?'Admin task queue':view==='autopilot'?'Autopilot':'Friday report')));
 if(view==='autopilot'){renderAutopilot(content);return;}
 if(view==='report'){renderReport(content);return;}
 if(view==='tasks'){renderTasks(content);return;}
 const invoices=view==='invoices';content.append(item('p',invoices?'Review overdue reminders before taking action.':'Review proposed matches and flag what’s missing.','fine'));
 const rows=invoices?work.invoices:work.receipts;
 for(const x of rows){
  const title=invoices?x.company:x.merchant;
  const status=invoices
   ?x.status==='paid'?badge('Paid','green'):x.status==='open'?badge('Not due'):x.reviewed?badge('Draft reviewed','green'):badge('Reminder to review','amber')
   :x.status==='missing'?badge(x.reviewed?'Requested · still missing':'Receipt missing','amber'):x.reviewed?badge('Match reviewed','green'):badge('Proposed match','sky');
  const tail=block('div','record-tail',item('strong',money(x.amount)),status);
  if(!invoices||x.status==='overdue'){const b=button('Review',()=>show(x,invoices));b.setAttribute('aria-label','Review '+title);tail.append(b);}
  content.append(block('article','record',block('div',null,item('h3',title),item('p',x.id+(invoices?' · '+x.date:''),'subtle')),tail));
 }
}
function draft(x){return 'Subject: Checking in on '+x.id+'\n\nHi '+x.company+' team,\n\nI’m checking on invoice '+x.id+' for '+money(x.amount)+' CAD. Our records show it is still open. If you’ve already paid it, could you share the date so we can check our records? Otherwise, please let us know when we should expect payment.\n\nThanks,\nBrightline Cleaning';}
function copyControl(label,value,holder){
 const feedback=item('p',undefined,'feedback');feedback.role='status';
 const copy=button(label,async()=>{
  try{await navigator.clipboard.writeText(value);feedback.textContent='Copied.';}
  catch{
   let box=holder.querySelector('textarea');if(!box){box=item('textarea');box.readOnly=true;box.value=value;box.setAttribute('aria-label',label+' text');holder.append(box);}box.focus();box.select();feedback.textContent='Select and copy the text.';
  }
 });
 return block('div',null,copy,feedback);
}
function show(x,invoices){
 $('detail-title').textContent=invoices?x.company:x.merchant;
 const body=$('detail-body');body.replaceChildren(item('p',x.id+' · '+money(x.amount)+' CAD','fine'));
 if(invoices){
  const area=item('textarea');area.value=draft(x);area.readOnly=true;area.setAttribute('aria-label','Reminder draft');body.append(area,copyControl('Copy draft',area.value,body));
 }else body.append(item('p',x.note,'subtle'));
 const label=x.reviewed?'Undo review':invoices?'Mark draft reviewed':x.status==='missing'?'Note receipt requested':'Mark match reviewed';
 body.append(block('div','dialog-actions',button(label,()=>{x.reviewed=!x.reviewed;render();$('detail').close();},'button primary')));
 $('detail').showModal();
}
function isOpen(action){
 const x=action.record;
 if(action.kind==='invoice')return x.status==='overdue'&&!x.reviewed;
 if(action.kind==='receipt')return !x.reviewed;
 return x.status!=='done';
}
function runAutopilot(){
 const actions=[];
 if(auto.enabled.has('invoice'))for(const x of unpaid())actions.push({kind:'invoice',record:x,title:'Payment reminder: '+x.company,why:x.id+' is '+x.date+'. A draft is ready.'});
 if(auto.enabled.has('receipt'))for(const x of work.receipts)actions.push({kind:'receipt',record:x,title:(x.status==='missing'?'Request receipt: ':'Check suggested match: ')+x.merchant,why:x.note});
 if(auto.enabled.has('task'))for(const x of pending())actions.push({kind:'task',record:x,title:x.title,why:x.next});
 let added=0, existing=0;
 for(const action of actions.filter(isOpen)){
  const key=action.kind+':'+action.record.id;
  if(auto.queue.has(key)){existing++;continue;}
  auto.queue.set(key,action);added++;
 }
 auto.history.push({added,existing});
 auto.message=count(added,'new work item')+' prepared. '+count(existing,'existing item')+' kept without duplicates.';
 render();
 $('autopilot-run').focus();
}
function renderAutopilot(content){
 content.append(item('p','Preview a rule-based run using fictional records. It prepares work for review; it never sends emails or changes your books.','fine'));
 const rules=block('fieldset','auto-rules',item('legend','Choose the work for this run'));
 const run=button('Run sample autopilot',runAutopilot,'button primary');run.id='autopilot-run';run.disabled=!auto.enabled.size;
 for(const [key,title] of autoRules){
  const check=item('input');check.type='checkbox';check.checked=auto.enabled.has(key);
  check.addEventListener('change',()=>{
   if(check.checked)auto.enabled.add(key);else auto.enabled.delete(key);
   run.disabled=!auto.enabled.size;
  });
  rules.append(block('label','auto-rule',check,item('span',title)));
 }
 const result=item('p',auto.message,'feedback');result.role='status';
 content.append(rules,run,result);
 const current=[...auto.queue.values()].filter(isOpen);
 const ordered=current.sort((a,b)=>Number(b.kind==='task'&&b.record.status==='approval')-Number(a.kind==='task'&&a.record.status==='approval'));
 content.append(block('div','view-head',item('h3','Prepared work'),badge(count(ordered.length,'open item'),'sky')));
 if(!ordered.length)content.append(item('p',auto.history.length?'No open items in this queue.':'Run the sample to see what the back office would prepare.','fine'));
 for(const action of ordered){
  const owner=action.kind==='task'&&action.record.status==='approval';
  const actionButton=button('Review',()=>action.kind==='task'?showTask(action.record):show(action.record,action.kind==='invoice'));
  actionButton.setAttribute('aria-label','Review '+action.title);
  content.append(block('article','record',block('div',null,item('h3',action.title),item('p',action.why,'subtle')),block('div','record-tail',badge(owner?'Owner decision':'Review',''+(owner?'amber':'sky')),actionButton)));
 }
 if(auto.history.length){
  const history=block('details','auto-history',item('summary','Run history · '+auto.history.length));
  history.append(block('ol','task-list',...auto.history.map((x,i)=>item('li','Run '+(i+1)+': '+count(x.added,'new item')+' prepared, '+count(x.existing,'existing item')+' kept.'))));
  content.append(history);
 }
}
function renderTasks(content){
 content.append(item('p','Track what’s moving, who owns the next step, and what needs the owner’s approval.','fine'));
 for(const x of work.tasks){
  const open=button('Open task',()=>showTask(x));open.setAttribute('aria-label','Open '+x.title);
  const tone={todo:'sky',working:'sky',approval:'amber',done:'green'}[x.status];
  content.append(block('article','record',block('div',null,item('h3',x.title),item('p',x.kind+' · '+x.due+' · '+x.owner,'subtle')),block('div','record-tail',badge(taskStatus[x.status],tone),open)));
 }
}
function showTask(x){
 $('detail-title').textContent=x.title;
 const body=$('detail-body');
 const select=item('select');select.id='task-state';select.className='task-select';
 for(const [key,text] of Object.entries(taskStatus)){const o=item('option',text);o.value=key;select.append(o);}
 select.value=x.status;
 const label=block('label','task-status',item('span','Task status','task-label'),select);
 body.replaceChildren(item('p',x.id+' · '+x.owner+' · Due '+x.due.toLowerCase(),'fine'),item('p',x.next,'task-next'),label);
 if(x.draft)body.append(item('p',x.draft,'task-draft'),copyControl('Copy reply draft',x.draft,body));
 body.append(button('Save task status',()=>{x.status=select.value;render();$('detail').close();},'button primary'));
 $('detail').showModal();
}
function renderReport(content){
 const follow=decisions().length;
 const reviewed=unpaid().length-follow;
 const missed=errors().length;
 const matchCount=outstanding().length-missed;
 const lines=[
  ['Cash snapshot',money(sum(work.invoices.filter(x=>x.status==='paid')))+' paid this week · '+money(sum(unpaid()))+' overdue (CAD).'],
  ...(auto.history.length?[['Autopilot',count(auto.history.length,'sample run')+' · '+count([...auto.queue.values()].filter(isOpen).length,'automated work item')+' open.']]:[]),
  ['Admin tasks',count(pending().length,'open task')+'; '+count(pending().filter(x=>x.status==='approval').length,'owner decision')+'.'],
  ['Invoice decisions',count(follow,'reminder draft')+' to review. '+count(reviewed,'draft')+' reviewed. No reminders have been sent.'],
  ['Receipt decisions',count(matchCount,'proposed match','proposed matches')+' to review. '+count(missed,'receipt')+' still missing.'],
  ['Next action',pending().some(x=>x.status==='approval')?'Review the admin tasks that need an owner decision.':follow?'Review the remaining invoice drafts.':matchCount?'Review the remaining receipt matches.':missed?'Follow up on missing receipts.':'Confirm the report with the owner.']
 ];
 const report=block('div','report',...lines.map(([title,value])=>block('article',null,item('h3',title),item('p',value))));
 const details=pending().map(x=>x.title+' ('+taskStatus[x.status]+', '+x.owner+'): '+x.next);
 if(details.length)report.append(block('article',null,item('h3','Open admin tasks'),block('ul','task-list',...details.map(x=>item('li',x)))));
 const text='Brightline Cleaning · Sample Friday report\n\n'+lines.map(([k,v])=>k+': '+v).join('\n')+(details.length?'\n\nOpen admin tasks:\n'+details.map(x=>'- '+x).join('\n'):'');
 content.append(report,block('div','report-actions',copyControl('Copy sample report',text,content),button('See pilot setup checklist',()=>$('setup').showModal(),'button primary')));
}
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;render();});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('reset').addEventListener('click',()=>{work=structuredClone(inputs);auto=newAutopilot();view=location.hash==='#autopilot'?'autopilot':'invoices';render();});
render();
