'use strict';
const $=id=>document.getElementById(id);
const inputs={
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
let work=structuredClone(inputs), view='invoices';
const money=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
function item(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function block(tag,cls,...nodes){const el=item(tag,undefined,cls);el.append(...nodes);return el;}
function button(title,fn,cls='button light'){const el=item('button',title,cls);el.type='button';el.addEventListener('click',fn);return el;}
function badge(text,cls=''){return item('span',text,'pill '+cls);}
const unpaid=()=>work.invoices.filter(x=>x.status==='overdue');
const decisions=()=>unpaid().filter(x=>!x.reviewed);
const outstanding=()=>work.receipts.filter(x=>x.status==='missing'||!x.reviewed);
const errors=()=>outstanding().filter(x=>x.status==='missing');
const count=(n,label,plural=label+'s')=>n+' '+(n===1?label:plural);
const sum=rows=>rows.reduce((n,r)=>n+r.amount,0);
function render(){
 $('metrics').replaceChildren(...[['Paid this week',money(sum(work.invoices.filter(x=>x.status==='paid')))],['Overdue',money(sum(unpaid()))],['Open review items',String(decisions().length+outstanding().length)]].map(([title,value])=>block('article','metric',item('span',title),item('strong',value))));
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
 const content=$('view');content.replaceChildren(block('div','view-head',item('h2',view==='invoices'?'Invoice review':view==='receipts'?'Receipt review':'Friday report')));
 if(view==='report'){renderReport(content);return;}
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
function renderReport(content){
 const follow=decisions().length;
 const reviewed=unpaid().length-follow;
 const missed=errors().length;
 const matchCount=outstanding().length-missed;
 const lines=[
  ['Cash snapshot',money(sum(work.invoices.filter(x=>x.status==='paid')))+' paid this week · '+money(sum(unpaid()))+' overdue (CAD).'],
  ['Invoice decisions',count(follow,'reminder draft')+' to review. '+count(reviewed,'draft')+' reviewed. No reminders have been sent.'],
  ['Receipt decisions',count(matchCount,'proposed match','proposed matches')+' to review. '+count(missed,'receipt')+' still missing.'],
  ['Next action',follow?'Review the remaining invoice drafts.':matchCount?'Review the remaining receipt matches.':missed?'Follow up on missing receipts.':'Confirm the report with the owner.']
 ];
 const report=block('div','report',...lines.map(([title,value])=>block('article',null,item('h3',title),item('p',value))));
 const text='Brightline Cleaning · Sample Friday report\n\n'+lines.map(([k,v])=>k+': '+v).join('\n');
 content.append(report,block('div','report-actions',copyControl('Copy sample report',text,content),button('See pilot setup checklist',()=>$('setup').showModal(),'button primary')));
}
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;render();});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('reset').addEventListener('click',()=>{work=structuredClone(inputs);view='invoices';render();});
render();
