'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,rm}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {once}=require('node:events');
const {createServer}=require('./server.cjs');
const D=require('./public/domain.js');
const plus=h=>new Date(Date.now()+h*3600000).toISOString();
async function start(options={dbPath:':memory:'}){
 const server=createServer(options);server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;
 return {stop:()=>new Promise((r,j)=>server.close(err=>err?j(err):r())),request:async(method,path,input,auth,receipt,extra)=>{
  const res=await fetch(url+path,{method,headers:{...(input?{'content-type':'application/json'}:{}),...(auth?{authorization:'Bearer '+auth}:{}),...(receipt?{'x-receipt':receipt}:{}),...extra},body:input?JSON.stringify(input):undefined});
  return {status:res.status,data:(res.headers.get('content-type')||'').includes('json')?await res.json():await res.text()};
 }};
}
async function board(request,kind,data){
 const r=await request('POST','/api/boards',{kind,...data});
 assert.equal(r.status,201,JSON.stringify(r.data));
 return {path:'/api/boards/'+r.data.board.id,secret:r.data.secret};
}
test('only one concurrent customer gets the appointment; contact and receipt stay private',async()=>{
 const s=await start();try{
  const q=s.request,{path,secret}=await board(q,'slot',{title:'Small dog wash',where:'Juniper Grooming',when:plus(2),rules:'Dogs under 25 lb',price:'55.25'});
  const c={name:'Customer A',email:'customer-a@example.com',agree:true};
  assert.equal((await q('POST',path+'/act',{...c,agree:false})).status,400);
  const results=await Promise.all([q('POST',path+'/act',c),q('POST',path+'/act',{...c,name:'Customer B',email:'customer-b@example.com'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const i=results.findIndex(r=>r.status===201),{receipt}=results[i].data;
  const publicData=(await q('GET',path)).data.board;
  assert.equal(publicData.state,'claimed');assert.equal(publicData.claim,undefined);assert.equal(publicData.receipt,undefined);
  assert.equal(publicData.price,5525);
  assert.equal((await q('GET',path,null,null,receipt)).data.board.receipt.at,publicData.updated);
  assert.equal((await q('GET',path,null,secret)).data.board.claim.email,i===0?'customer-a@example.com':'customer-b@example.com');
  assert.equal((await q('PATCH',path,{action:'release'})).status,403);
  assert.equal((await q('PATCH',path,{action:'release'},secret)).data.board.state,'available');
  assert.equal((await q('GET',path,null,null,receipt)).data.board.receipt,undefined);
  assert.equal((await q('PATCH',path,{action:'close'},secret)).data.board.state,'closed');
  assert.equal((await q('PATCH',path,{action:'reopen'},secret)).data.board.state,'available');
  assert.equal((await q('PATCH',path,{action:'delete'},secret)).status,200);
  assert.equal((await q('GET',path)).status,404);
 }finally{await s.stop();}
});
test('an item cannot be borrowed twice, and checked-out gear persists across a restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fieldkit-')), opt={dbPath:join(dir,'test.sqlite')};
 let s=await start(opt);try{
  let q=s.request;const {path,secret}=await board(q,'borrow',{title:'Gear shed',days:5});
  const add=await q('PATCH',path,{action:'add',title:'Helmet 7'},secret), item=add.data.board.items[0].id;
  assert.equal((await q('PATCH',path,{action:'add',title:'helmet 7'},secret)).status,409);
  const c={item,name:'J. Player',agree:true};
  const results=await Promise.all([q('POST',path+'/act',c),q('POST',path+'/act',{...c,name:'K. Player'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const {receipt}=results.find(r=>r.status===201).data;
  const publicItem=(await q('GET',path)).data.board.items[0];
  assert.equal(publicItem.name,undefined);assert.equal(publicItem.receipt,undefined);
  assert(publicItem.due>=plus(119));
  await s.stop();s=await start(opt);q=s.request;
  assert.equal((await q('GET',path,null,null,receipt)).data.board.items[0].receipt,true);
  assert.equal((await q('PATCH',path,{action:'remove',item},secret)).status,409);
  assert.equal((await q('PATCH',path,{action:'return',item},secret)).data.board.items[0].state,'in');
  assert.equal((await q('PATCH',path,{action:'remove',item},secret)).data.board.items.length,0);
 }finally{await s.stop();await rm(dir,{recursive:true,force:true});}
});
test('game updates reach the same public link, keep earlier history, and reject unauthorized edits',async()=>{
 const s=await start({dbPath:':memory:',publicOrigin:'https://fieldkit.example.com'});try{
  const q=s.request,{path,secret}=await board(q,'rain',{title:'U13 opener',where:'West Diamond',when:plus(4)});
  const moved={action:'update',status:'moved',where:'East Diamond',note:'Field is flooded'};
  assert.equal((await q('PATCH',path,moved,'a'.repeat(32))).status,403);
  assert.equal((await q('PATCH',path,moved,secret,null,{origin:'https://elsewhere.example.com'})).status,403);
  assert.equal((await q('PATCH',path,{...moved,where:''},secret)).status,400);
  assert.equal((await q('PATCH',path,moved,secret)).status,200);
  assert.equal((await q('GET',path)).data.board.updates[0].where,'East Diamond');
  assert.equal((await q('PATCH',path,{action:'update',status:'delayed',note:'Wait for the field crew'},secret)).status,400);
  const newTime=plus(6);
  await q('PATCH',path,{action:'update',status:'delayed',note:'Wait for the field crew',when:newTime},secret);
  const result=(await q('GET',path)).data.board.updates;
  assert.deepEqual(result.map(x=>x.status),['delayed','moved','on']);assert.equal(result[0].where,'East Diamond');assert.equal(result[0].when,newTime);
  assert.equal((await q('PATCH',path,{action:'announce',note:'Bring indoor shoes'})).status,403);
  assert.equal((await q('PATCH',path,{action:'announce',note:'Bring indoor shoes'},secret)).status,200);
  const announced=(await q('GET',path)).data.board;
  assert.deepEqual(announced.updates,result);assert.equal(announced.announcement.note,'Bring indoor shoes');
  assert.equal((await q('PATCH',path,{action:'clear-announcement'},secret)).data.board.announcement,undefined);
  assert.equal((await q('POST',path+'/act',{agree:true,name:'Player'})).status,405);
  assert.match((await q('GET','/')).data,/name="field-kit-mode" content="shared"/);
 }finally{await s.stop();}
});
test('an elapsed appointment cannot be claimed or reopened',()=>{
 const t='2030-01-01T12:00:00.000Z', b=D.create({kind:'slot',title:'Trim',when:'2030-01-01T13:00Z',where:'Shop',rules:'Small breeds',price:'32'},t,()=>'id');
 const later='2030-01-01T13:00:00.000Z';
 assert.equal(D.view(b,later).state,'expired');
 assert.throws(()=>D.act(b,{name:'Someone',agree:true,email:'demo@example.com'},later,()=>'',()=>''),/no longer available/);
});

test('any service type can book with no special rules or posted price',async()=>{
 const s=await start();try{
  const q=s.request,{path}=await board(q,'slot',{title:'Gel manicure',where:'Nail studio',when:plus(3),category:'Nails',with:'Sam',duration:'50'});
  const b=(await q('GET',path)).data.board;
  assert.equal(b.price,null);assert.equal(b.rules,'');assert.equal(b.duration,50);assert.equal(b.category,'Nails');assert.equal(b.with,'Sam');
  assert.equal((await q('POST',path+'/act',{name:'Demo Customer',email:'demo@example.com',agree:true})).status,201);
  assert.equal((await q('POST','/api/boards',{kind:'slot',title:'Cut',where:'Hair studio',when:plus(2),duration:'721'})).status,400);
 }finally{await s.stop();}
});
test('LastSlot business page keeps a stable URL, offers private waitlist and atomically reserves each opening',async()=>{
 const s=await start();try{
  const q=s.request,{path,secret}=await board(q,'slot-hub',{title:'Birch Studio',where:'12 King Street'});
  assert.equal((await q('PATCH',path,{action:'new-listing',title:'Cut',when:plus(3)})).status,403);
  await q('PATCH',path,{action:'new-listing',title:'Cut',when:plus(3),category:'Hair'},secret);
  const published=await q('PATCH',path,{action:'new-listing',title:'Gel nails',when:plus(4),category:'Nails'},secret);
  assert.equal(published.status,200,JSON.stringify(published.data));
  const [cut,nails]=published.data.board.listings;
  assert.equal(cut.where,'12 King Street');
  const subscriber={action:'join',agree:true,name:'New Client',email:'new@example.com',service:'Nails'};
  assert.equal((await q('POST',path+'/act',{...subscriber,agree:false})).status,400);
  const joined=await q('POST',path+'/act',subscriber);
  assert.equal(joined.status,201);assert.equal(joined.data.board.subscribed,true);
  const token=joined.data.receipt;
  const publicView=(await q('GET',path)).data.board;
  assert.equal(publicView.contacts,undefined);assert.equal(publicView.subscribed,undefined);assert.equal(publicView.listings.length,2);
  const ownerView=(await q('GET',path,null,secret)).data.board;
  assert.equal(ownerView.contacts[0].email,'new@example.com');assert.equal(ownerView.contacts[0].token,undefined);
  const next={listing:nails.id,name:'First Customer',email:'first@example.com',agree:true};
  const claims=await Promise.all([q('POST',path+'/act',next),q('POST',path+'/act',{...next,email:'second@example.com'})]);
  assert.deepEqual(claims.map(a=>a.status).sort(),[201,409]);
  assert.deepEqual((await q('GET',path)).data.board.listings.map(x=>x.id),[cut.id]);
  const receipt=claims.find(a=>a.status===201).data.receipt, detail=path+'?listing='+nails.id;
  assert.equal((await q('GET',detail,null,null,receipt)).data.board.listing,nails.id);
  assert.equal((await q('GET',detail)).data.board.claim,undefined);
  assert.equal((await q('GET',detail,null,secret)).data.board.state,'claimed');
  assert.equal((await q('POST',path+'/act',{action:'unsubscribe',token})).status,201);
  assert.equal((await q('GET',path,null,secret)).data.board.contacts.length,0);
  assert.equal((await q('PATCH',path,{action:'delete-listing',listing:nails.id},secret)).status,200);
  assert.equal((await q('GET',detail)).status,404);
  assert.equal((await q('GET',path)).status,200);
 }finally{await s.stop();}
});
test('RainPlan groups events without losing the individual event links or authorization',async()=>{
 const s=await start();try{
  const q=s.request,{path,secret}=await board(q,'rain-hub',{title:'Winter activities',where:'Hall A'});
  await q('PATCH',path,{action:'new-listing',title:'Skating',when:plus(2)},secret);
  const created=await q('PATCH',path,{action:'new-listing',title:'Practice',when:plus(4)},secret);
  const [first,second]=created.data.board.listings;
  const p={action:'update',listing:first.id,status:'moved',note:'Another room',where:'Hall B',when:plus(7)};
  assert.equal((await q('PATCH',path,p)).status,403);
  assert.equal((await q('PATCH',path,p,secret)).status,200);
  const result=(await q('GET',path)).data.board;
  assert.deepEqual(result.listings.map(x=>x.id),[second.id,first.id]);
  assert.equal((await q('GET',path+'?listing='+first.id)).data.board.updates[0].where,'Hall B');
  assert.equal((await q('GET',path+'?listing='+second.id)).data.board.updates[0].status,'on');
 }finally{await s.stop();}
});
test('batch item import is all-or-nothing and the return log is visible only to organizers',async()=>{
 const s=await start();try{
  const q=s.request,{path,secret}=await board(q,'borrow',{title:'Club',days:2});
  const bulk=(titles)=>q('PATCH',path,{action:'bulk-add',titles},secret);
  assert.equal((await bulk(['Ladder','ladder'])).status,409);
  assert.equal((await q('GET',path)).data.board.items.length,0);
  const imported=(await bulk(['Helmet','Bag'])).data.board;
  assert.equal(imported.items.length,2);
  const item=imported.items[0].id;
  await q('POST',path+'/act',{item,name:'Manager sample',agree:true});
  await q('PATCH',path,{action:'return',item},secret);
  assert.equal((await q('GET',path)).data.board.history,undefined);
  assert.equal((await q('GET',path,null,secret)).data.board.history[0].name,'Manager sample');
  assert.equal((await q('PATCH',path,{action:'clear-history'},secret)).data.board.history.length,0);
 }finally{await s.stop();}
});
test('optional launch code gates organizer sign-up without blocking participant actions',async()=>{
 const s=await start({dbPath:':memory:',accessCode:'sample-only'});
 try{
  const q=s.request, payload={kind:'borrow',title:'Pilot gear',days:'2'};
  assert.match((await q('GET','/')).data,/name="field-kit-access" content="invite"/);
  assert.equal((await q('POST','/api/boards',payload)).status,403);
  const {path,secret}=await board(q,'borrow',{...payload,accessCode:'sample-only'});
  const updated=await q('PATCH',path,{action:'add',title:'Mat'},secret), item=updated.data.board.items[0].id;
  assert.equal((await q('POST',path+'/act',{item,name:'Another participant',agree:true})).status,201);
 }finally{await s.stop();}
});
