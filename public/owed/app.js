'use strict';
const $=id=>document.getElementById(id);
const key='owed.refunds.v1';
const editor=$('editor'), form=$('refund-form'), detail=$('case-dialog');
const add=$('add');
let rows=[], demo=false, filter='all', editing=null, active=null;
try{rows=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(rows))rows=[];}
catch{$('storage-note').textContent='Saved refunds could not be read. Try another browser if saving fails.';}
const day=(n=0)=>{const t=new Date();t.setDate(t.getDate()+n);return [t.getFullYear(),String(t.getMonth()+1).padStart(2,'0'),String(t.getDate()).padStart(2,'0')].join('-');};
const pretty=d=>new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
const money=(c,currency)=>new Intl.NumberFormat('en-CA',{style:'currency',currency,currencyDisplay:'code'}).format(c/100);
const safeDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d));
const samples=()=>[
 {id:'s1',business:'Northline Hotel',cents:24000,currency:'CAD',due:day(-5),history:[]},
 {id:'s2',business:'West Market',cents:7260,currency:'CAD',due:day(4),history:[]},
 {id:'s3',business:'Harbour Rail',cents:9500,currency:'CAD',due:day(-10),received:day(-3),history:[day(-6)]}
];
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function block(tag,cls,...kids){const x=el(tag,undefined,cls);x.append(...kids);return x;}
function btn(label,click,cls='button thin'){const x=el('button',label,cls);x.type='button';x.addEventListener('click',click);return x;}
const timing=r=>r.next||r.due;
const state=r=>r.received?'received':timing(r)<=day()?'overdue':'waiting';
const stateText={overdue:'Follow up due',waiting:'Waiting',received:'Received'};
const badge=r=>el('span',stateText[state(r)],'pill '+state(r));
const notice=text=>{$('feedback').textContent=text;$('feedback').hidden=!text;};
function save(next){
 if(!demo){try{localStorage.setItem(key,JSON.stringify(next));}catch{return false;}}
 rows=next;render();return true;
}
const replace=r=>save(rows.map(x=>x.id===r.id?r:x));
function stat(title,values){
 const node=block('article','stat',el('h2',title));
 for(const [amount,sub] of values){node.append(el('strong',amount));if(sub)node.append(el('small',sub));}return node;
}
function totals(list){
 const groups={};
 for(const {cents,currency} of list)groups[currency]=(groups[currency]||0)+cents;
 return Object.entries(groups).sort().map(([ccy,total])=>[new Intl.NumberFormat('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(total/100),ccy]);
}
function render(){
 const open=rows.filter(x=>!x.received), received=rows.filter(x=>x.received), due=open.filter(x=>state(x)==='overdue');
 $('stats').replaceChildren(stat('Outstanding',totals(open).length?totals(open):[['0.00',null]]),stat('Follow up due',[[String(due.length),null]]),stat('Received',totals(received).length?totals(received):[['0.00',null]]));
 const view=rows.filter(x=>filter==='all'||state(x)===(filter==='due'?'overdue':'received')).sort((a,b)=>Number(!!a.received)-Number(!!b.received)||timing(a).localeCompare(timing(b)));
 const records=$('records');records.replaceChildren();
 if(!view.length){
  const empty=block('div','empty',el('h3',rows.length?'Nothing in this view':'Track your first refund'),el('p',rows.length?'Use All to see the rest of your refunds.':'Start with a refund a business has already promised.'));
  if(!rows.length&&!demo)empty.append(btn('Try sample refunds',()=>{location.hash='demo';}));
  records.append(empty);
 }
 for(const r of view){
  const summary=block('div','refund-summary',el('h3',r.business),el('p',r.received?'Received '+pretty(r.received):(r.next?'Next check ':'Promised by ')+pretty(timing(r))));
  const openBtn=btn('Open',()=>show(r.id));openBtn.setAttribute('aria-label','Open '+r.business);
  records.append(block('article','refund-row',summary,block('div','refund-tail',el('strong',money(r.cents,r.currency)),badge(r),openBtn)));
 }
}
function openEditor(r){
 editing=r?.id||null;form.reset();$('editor-title').textContent=r?'Edit refund':'Track a refund';
 if(r){form.elements.business.value=r.business;form.elements.amount.value=(r.cents/100).toFixed(2);form.elements.currency.value=r.currency;form.elements.due.value=r.due;}
 if(detail.open)detail.close();editor.showModal();
}
form.addEventListener('submit',e=>{
 e.preventDefault();const f=new FormData(form),business=f.get('business').trim(),due=f.get('due'),currency=f.get('currency'),cents=Math.round(Number(f.get('amount'))*100);
 if(!business||!safeDate(due)||!Number.isInteger(cents)||cents<1||cents>100000000||!['CAD','USD','GBP','EUR','AUD'].includes(currency)){ form.elements.business.setCustomValidity(!business?'Enter a business name.':''); form.reportValidity();return; }
 const previous=rows.find(r=>r.id===editing);
 const r={...(previous||{id:crypto.randomUUID(),history:[]}),business,due,currency,cents};
 if(!save(previous?rows.map(x=>x.id===r.id?r:x):[...rows,r])){alert('Your browser couldn’t save this refund. Check your browser storage settings.');return;}
 editor.close();notice(previous?'Refund updated.':'Refund added.');
 if(previous)show(r.id);else add.focus();
});
form.elements.business.addEventListener('input',()=>form.elements.business.setCustomValidity(''));
function draft(r){
 return 'Subject: Follow-up on promised refund\n\nHello '+r.business+' team,\n\nI’m following up on a refund of '+money(r.cents,r.currency)+' that you said would arrive by '+pretty(r.due)+'. I haven’t received it yet. Could you confirm when it was or will be processed, and share the refund reference if available?\n\nBooking or order reference: [add here]\n\nThank you.';
}
function show(id){
 const r=rows.find(x=>x.id===id);if(!r)return;active=id;
 $('case-title').textContent=r.business;
 const label=r.received?'Received '+pretty(r.received):'Promised by '+pretty(r.due)+(r.next?' · Next check '+pretty(r.next):'');
 const body=$('case-body'), status=el('p',undefined,'dialog-note');status.role='status';
 body.replaceChildren(block('div','case-meta',el('strong',money(r.cents,r.currency)),badge(r)),el('p',label,'fine'));
 if(!r.received){
  if(state(r)==='overdue'||r.history.length){
   const text=el('textarea');text.value=draft(r);text.setAttribute('aria-label','Follow-up draft');text.readOnly=true;
   const copy=btn('Copy draft',async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Draft copied.';}catch{text.focus();text.select();status.textContent='Select the draft and copy it.';}});
   body.append(block('section','case-section',el('h3','Follow-up draft'),el('p','Add your reference and send it in the original email thread.','fine'),text,copy));
  }
  const log=el('form'), next=el('input');next.type='date';next.value=day(4);next.min=day(1);next.required=true;
  const submit=el('button','Log follow-up','button thin');submit.type='submit';
  log.append(block('label',null,document.createTextNode('Next day to check'),next),submit);
  log.addEventListener('submit',e=>{
   e.preventDefault();if(!safeDate(next.value)||next.value<=day())return;
   if(replace({...r,next:next.value,history:[day(),...r.history]})){show(id);$('case-body').querySelector('[role=status]').textContent='Follow-up logged.';}
   else status.textContent='Unable to save the change.';
  });
  body.append(block('section','case-section',el('h3','Already followed up?'),log));
 }
 if(r.history.length){const list=el('ul',undefined,'history');for(const d of r.history)list.append(el('li','Followed up '+pretty(d)));body.append(block('section','case-section',el('h3','Activity'),list));}
 const receivedBtn=r.received?btn('Reopen refund',()=>{if(replace({...r,received:null})){show(id);$('case-body').querySelector('[role=status]').textContent='Refund reopened.';}else status.textContent='Unable to save the change.';}):btn('Mark received',()=>{if(replace({...r,received:day()})){show(id);$('case-body').querySelector('[role=status]').textContent='Marked received.';}else status.textContent='Unable to save the change.';},'button primary');
 const remove=btn('Remove refund',()=>{if(!confirm('Remove this refund and its activity?'))return;if(save(rows.filter(x=>x.id!==active))){detail.close();notice('Refund removed.');add.focus();}else status.textContent='Unable to save the change.';},'button thin danger');
 body.append(block('div','case-actions',receivedBtn,btn('Edit',()=>openEditor(r)),remove),status);
 if(!detail.open)detail.showModal();
}
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',() => $(b.dataset.close).close());
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));render();});
add.addEventListener('click',()=>openEditor());
$('exit-demo').addEventListener('click',()=>{location.hash='';});
function route(){
 const nextDemo=location.hash==='#demo';
 if(nextDemo!==demo){
  if(editor.open)editor.close();if(detail.open)detail.close();demo=nextDemo;filter='all';notice('');
  for(const b of document.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter==='all'));
  try{rows=demo?samples():JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(rows))rows=[];}catch{rows=[];}
 }
 $('demo-banner').hidden=!demo;render();
 if(location.hash==='#new'){history.replaceState(null,'',location.pathname+location.search);openEditor();}
}
window.addEventListener('hashchange',route);route();
