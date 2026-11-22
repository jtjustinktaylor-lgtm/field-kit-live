'use strict';
const $=id=>document.getElementById(id), key='friday-office.personal.v1';
const editor=$('edit'), detail=$('detail'), form=$('work-form'), f=form.elements;
const kinds={task:'Task',invoice:'Invoice',receipt:'Receipt',schedule:'Schedule change',errand:'Errand',home:'Home care',appointment:'Appointment',bill:'Bill or renewal'};
const repeats={none:'',daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly'};
const starters=[['Put the bins out','home','weekly'],['Pick up groceries','errand','none'],['Book a checkup','appointment','none'],['Review a subscription','bill','monthly']];
let work=[], view='list', editing=null, saveOK=true, lastMessage='';
try{
 const saved=JSON.parse(localStorage.getItem(key)||'[]');
 if(!Array.isArray(saved)||saved.some(r=>!r||typeof r.id!=='string'||typeof r.title!=='string'||!Object.hasOwn(kinds,r.kind)))throw Error('Bad saved list');
 work=saved;
}catch{saveOK=false;showStorageProblem();}
const dateKey=()=>{
 const t=new Date();
 return String(t.getFullYear()).padStart(4,'0')+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
};
const pretty=d=>new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
const utcDay=key=>new Date(key+'T00:00:00Z');
const isoDay=date=>date.toISOString().slice(0,10);
const dayMillis=86400000;
function nextDue(r,today){
 const due=utcDay(r.due), cutoff=utcDay(r.due>today?r.due:today);
 if(r.repeat==='daily'||r.repeat==='weekly'){
  const step=(r.repeat==='weekly'?7:1)*dayMillis;
  return isoDay(new Date(+due+(Math.floor((cutoff-due)/step)+1)*step));
 }
 const step=r.repeat==='yearly'?12:1;
 const delta=(cutoff.getUTCFullYear()-due.getUTCFullYear())*12+cutoff.getUTCMonth()-due.getUTCMonth();
 let n=Math.max(1,Math.floor(delta/step));
 function at(months){
  const day=new Date(due);day.setUTCDate(1);day.setUTCMonth(day.getUTCMonth()+months);
  const end=new Date(day);end.setUTCMonth(end.getUTCMonth()+1,0);
  day.setUTCDate(Math.min(r.anchor||due.getUTCDate(),end.getUTCDate()));
  return day;
 }
 let next=at(n*step);
 if(next<=cutoff)next=at((n+1)*step);
 return isoDay(next);
}
const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',currencyDisplay:'code'}).format(n/100);
const timeStatus=r=>!r.due?'No due date':r.due<dateKey()?'Overdue':r.due===dateKey()?'Due today':'Upcoming';
const pending=()=>work.filter(r=>!r.done);
const queued=()=>pending().filter(r=>r.queued&&!r.reviewed);
const priority=r=>(r.decision?0:1)*3+({Overdue:0,'Due today':1,Upcoming:2,'No due date':2})[timeStatus(r)];

function el(tag,text,cls){
 const x=document.createElement(tag);
 if(text!==undefined)x.textContent=text;if(cls)x.className=cls;
 return x;
}
function block(tag,cls,...items){const x=el(tag,undefined,cls);x.append(...items);return x;}
function button(title,run,cls='button light'){
 const b=el('button',title,cls);b.type='button';b.addEventListener('click',run);return b;
}
const badge=(text,tone)=>el('span',text,'pill '+(tone||''));
function showStorageProblem(){$('storage').textContent='Browser storage is unavailable. Your changes will only last until you close or reload this page.';}
function commit(next,notice){
 work=next;
 if(saveOK){try{localStorage.setItem(key,JSON.stringify(work));}catch{saveOK=false;showStorageProblem();}}
 lastMessage=notice;render();
}
function patch(id,fields,notice){commit(work.map(r=>r.id===id?{...r,...fields}:r),notice);}
const count=(n,label)=>n+' '+label+(n===1?'':'s');
function render(){
 const open=pending();
 $('summary').replaceChildren(...[
  ['Open items',open.length],
  ['Due today or overdue',open.filter(r=>r.due&&r.due<=dateKey()).length],
  ['Waiting for review',queued().length]
 ].map(([label,value])=>block('article','metric',el('span',label),el('strong',String(value)))));
 $('status').textContent=lastMessage;
 $('run').disabled=!open.length;
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
 const container=$('view');
 container.replaceChildren(block('div','view-head',el('h2',view==='list'?'All items':view==='today'?'Today and next up':'Review queue')));
 const sort=(a,b)=>Number(a.done)-Number(b.done)||priority(a)-priority(b)||(a.due||'9999').localeCompare(b.due||'9999');
 if(view==='today'){
  const today=dateKey(), horizon=isoDay(new Date(+utcDay(today)+7*dayMillis));
  const due=open.filter(r=>r.due&&r.due<=today).sort(sort);
  const next=open.filter(r=>r.due>today&&r.due<=horizon).sort(sort);
  for(const [heading,items,empty] of [['Due today or overdue',due,'Nothing is due today.'],['Next 7 days',next,'Nothing is scheduled this week.']]){
   const group=block('section','life-group',el('h3',heading));
   if(items.length)group.append(...items.map(row));else group.append(el('p',empty,'fine'));
   container.append(group);
  }
  const undated=open.filter(r=>!r.due).length;
  if(undated)container.append(el('p',count(undated,'undated item')+' in All items.','fine'));
  return;
 }
 const rows=(view==='list'?[...work]:queued()).sort(sort);
 if(!rows.length){
  const empty=block('div','personal-empty',el('h3',view==='list'?'Start with one thing':'Nothing waiting for review'),el('p',view==='list'?'Add a task or try an everyday example.':'Add an item and run Autopilot to prepare your next steps.','fine'));
  if(view==='list')empty.append(block('div','life-starters',...starters.map(([title,kind,repeat])=>button(title,()=>openEditor(null,{title,kind,repeat})))));
  container.append(empty);
 }
 for(const r of rows)container.append(row(r));
 if(view==='review'&&rows.length)container.append(copyControl('Copy review summary','My Autopilot review queue\n\n'+rows.map(r=>'- '+r.title+': '+recommend(r).next).join('\n')));
}
function row(r){
 const label=r.done?'Done':r.decision?'Needs your decision':timeStatus(r);
 const tone=r.done?'green':r.decision||label==='Overdue'?'amber':'sky';
 const desc=[kinds[r.kind],r.due?pretty(r.due):null,repeats[r.repeat],r.cents?money(r.cents):null].filter(Boolean).join(' · ');
 const b=button(view==='review'?'Review':'Open',()=>openDetail(r.id));
 b.setAttribute('aria-label',(view==='review'?'Review ':'Open ')+r.title);
 return block('article','record',block('div','personal-title',el('h3',r.title),el('p',desc,'subtle')),block('div','record-tail',badge(label,tone),b));
}

function openEditor(r,preset){
 editing=r?.id||null;form.reset();f.title.setCustomValidity('');f.due.setCustomValidity('');
 $('edit-title').textContent=r?'Edit item':'Add item';
 if(detail.open)detail.close();
 if(r){
  f.title.value=r.title;f.kind.value=r.kind;f.due.value=r.due||'';
  f.repeat.value=r.repeat||'none';f.amount.value=r.cents?(r.cents/100).toFixed(2):'';f.decision.checked=r.decision;
 }
 if(preset){f.title.value=preset.title;f.kind.value=preset.kind;f.repeat.value=preset.repeat;}
 syncAmount();editor.showModal();
}
function syncAmount(){const use=f.kind.value==='invoice';$('amount-field').hidden=!use;f.amount.disabled=!use;}
f.kind.addEventListener('change',syncAmount);
f.title.addEventListener('input',()=>f.title.setCustomValidity(''));
f.due.addEventListener('input',()=>f.due.setCustomValidity(''));
f.repeat.addEventListener('change',()=>f.due.setCustomValidity(''));
form.addEventListener('submit',event=>{
 event.preventDefault();
 const title=f.title.value.trim(), kind=f.kind.value, due=f.due.value, repeat=f.repeat.value;
 if(!title){f.title.setCustomValidity('Enter a short label.');form.reportValidity();return;}
 if((due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))||!Object.hasOwn(kinds,kind))return;
 if(!Object.hasOwn(repeats,repeat))return;
 if(repeat!=='none'&&!due){f.due.setCustomValidity('Choose a first due date for this routine.');form.reportValidity();return;}
 const decision=f.decision.checked;
 const cents=kind==='invoice'&&f.amount.value?Math.round(Number(f.amount.value)*100):null;
 if(cents!==null&&(!Number.isSafeInteger(cents)||cents<1||cents>100000000))return;
 const prior=work.find(r=>r.id===editing);
 const changed=!prior||prior.title!==title||prior.kind!==kind||prior.due!==due||prior.decision!==decision||prior.cents!==cents||(prior.repeat||'none')!==repeat;
 const row={id:prior?.id||crypto.randomUUID(),title,kind,due,cents,decision,repeat,anchor:due?(prior?.due===due&&prior.repeat===repeat?prior.anchor:null)||utcDay(due).getUTCDate():null,done:prior?.done&&repeat==='none',queued:changed?false:prior.queued,reviewed:changed?false:prior.reviewed};
 editor.close();view='list';
 commit(prior?work.map(r=>r.id===row.id?row:r):[...work,row],prior?'Item updated.':'Item added.');
 $('new').focus();
});
function recommend(r){
 const when=timeStatus(r);
 if(r.decision)return {next:'Decide what should happen before this moves forward.'};
 if(r.kind==='invoice'){
  if(when==='Upcoming')return {next:'Check the payment on the due date. No follow-up is due yet.'};
  if(when==='No due date')return {next:'Confirm the invoice due date and open balance.'};
  return {next:'Verify the balance before sending a payment follow-up.',
   draft:'Hi, I’m checking in on '+r.title+(r.cents?' for '+money(r.cents):'')+'. Could you confirm the payment status and when we should expect it? If it’s already been paid, please let me know so I can check my records. Thanks.'};
 }
 if(r.kind==='errand')return {next:'Check what you need before heading out. Group this with another stop if you can.'};
 if(r.kind==='home')return {next:'Set aside time and check whether you need supplies.'};
 if(r.kind==='appointment')return {next:'Confirm the time and location, and check what to bring.'};
 if(r.kind==='bill')return {next:when==='Overdue'?'Check whether it’s already paid or renewed, then confirm the next step.':'Check the amount and renewal terms before the due date.'};
 if(r.kind==='receipt')return {next:'Look for the receipt or request a copy before marking this done.',
  draft:'Hi, could you send me a copy of the receipt for '+r.title+' when you get a chance? Thanks.'};
 if(r.kind==='schedule')return {next:'Confirm availability before promising a new time.',
  draft:'Thanks for the heads-up. I’m checking availability for '+r.title+' and will confirm once I have a time that works.'};
 return {next:when==='Overdue'?'Check what’s blocking this and set a new next step.':'Confirm the next step and who owns it.'};
}
function copyControl(label,value){
 const feedback=el('p',undefined,'feedback');feedback.role='status';
 const area=el('textarea');area.readOnly=true;area.hidden=true;area.value=value;area.setAttribute('aria-label',label+' text');
 const copy=button(label,async()=>{
  try{await navigator.clipboard.writeText(value);feedback.textContent='Copied.';}
  catch{area.hidden=false;area.focus();area.select();feedback.textContent='Select and copy the text.';}
 });
 return block('div','personal-copy',copy,feedback,area);
}
function openDetail(id){
 const r=work.find(x=>x.id===id);if(!r)return;
 $('detail-title').textContent=r.title;
 const body=$('detail-body');body.replaceChildren(el('p',[kinds[r.kind],r.due?pretty(r.due):null,repeats[r.repeat],r.cents?money(r.cents):null].filter(Boolean).join(' · '),'fine'));
 if(r.queued&&!r.done){
  const rec=recommend(r);
  body.append(block('div','task-draft',el('h3','Suggested next step'),el('p',rec.next)));
  if(rec.draft)body.append(el('p',rec.draft,'task-draft'),copyControl('Copy draft',rec.draft));
 }else if(!r.done)body.append(el('p','Run Autopilot to prepare a suggested next step.','task-draft'));
 const actions=block('div','dialog-actions');
 const recurring=Boolean(repeats[r.repeat]&&r.due);
 if(r.queued&&!r.reviewed&&!r.done)actions.append(button('Mark reviewed',()=>{detail.close();patch(id,{reviewed:true},'Marked reviewed. The work stays open.');}));
 actions.append(
  button(r.done?'Reopen':recurring?'Complete occurrence':'Mark done',()=>{
   detail.close();
   if(recurring&&!r.done){
    const next=nextDue(r,dateKey());
    patch(id,{due:next,queued:false,reviewed:false,preparedOn:null},'Completed. Next due '+pretty(next)+'.');
   }else patch(id,r.done?{done:false,queued:false,reviewed:false}:{done:true},r.done?'Reopened.':'Marked done.');
  },'button primary'),
  button('Edit',()=>openEditor(r)),
  button('Remove',()=>{if(confirm('Remove this item from your list?')){detail.close();commit(work.filter(x=>x.id!==id),'Item removed.');}},'button light personal-danger')
 );
 body.append(actions);detail.showModal();
}
$('new').addEventListener('click',()=>openEditor());
$('run').addEventListener('click',()=>{
 const today=dateKey();
 const prepare=r=>!r.done&&(!r.queued||(r.kind==='invoice'&&!r.decision&&r.reviewed&&r.due&&r.preparedOn<r.due&&r.due<=today));
 const additions=work.filter(prepare).length;
 view='review';
 commit(work.map(r=>prepare(r)?{...r,queued:true,reviewed:false,preparedOn:today}:r),
  additions?count(additions,'new review item')+' prepared.':('No new items. '+count(queued().length,'item')+' waiting for review.'));
});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;render();});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
render();
