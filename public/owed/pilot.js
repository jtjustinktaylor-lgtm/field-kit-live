'use strict';
const form=document.getElementById('pilot-form'), e=form.elements, result=document.getElementById('result'), box=document.getElementById('message');
function set(id,show){
 const section=document.getElementById(id);section.hidden=!show;
 for(const x of section.querySelectorAll('input,select'))x.disabled=!show;
}
function render(){
 const start=e.stage.value==='start';
 set('intake',start);set('follow-up',!start);set('paid',e.stage.value==='14');
 box.hidden=true;result.textContent='';
}
e.stage.addEventListener('change',render);
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const stage=e.stage.value, text=stage==='start'
  ?['Owed pilot: joining','Business category: '+e.category.value,'Country: '+e.country.value,'Promised refund: '+e.currency.value+' '+Number(e.promised.value).toFixed(2),'Days overdue: '+e.late.value]
  :['Owed pilot: day '+stage,'Sent the draft: '+e.draft.value,'Received so far: '+Number(e.received.value).toFixed(2),...(stage==='14'?['Would pay CAD 10 for personal help: '+e.price.value]:[])];
 box.value=text.join('\n');box.hidden=false;
 try{await navigator.clipboard.writeText(box.value);result.textContent='Copied. Send this to the person who invited you.';}
 catch{box.focus();box.select();result.textContent='Select and copy the update below, then send it to the person who invited you.';}
});
render();
