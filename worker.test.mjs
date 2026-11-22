import {test} from 'node:test';
import assert from 'node:assert/strict';

const site = process.env.FIELD_KIT_TEST_URL;
const code = process.env.FIELD_KIT_TEST_CODE;
if (!site || !code) throw new Error('Set FIELD_KIT_TEST_URL and FIELD_KIT_TEST_CODE for a local Worker.');

async function api(method, path, body, key, receipt, origin) {
  const r = await fetch(site + path, {
    method, headers: {
      ...(body ? {'Content-Type': 'application/json'} : {}),
      ...(key ? {'Authorization': 'Bearer ' + key} : {}),
      ...(receipt ? {'X-Receipt': receipt} : {}),
      ...(origin ? {'Origin': origin} : {}),
    },
    body: body && JSON.stringify(body)
  });
  return {status:r.status, ...await r.json()};
}
const plus = h => new Date(Date.now() + h * 3600000).toISOString();
async function create(kind, fields) {
  const result = await api('POST', '/api/boards', {kind, accessCode:code, ...fields});
  assert.equal(result.status, 201, JSON.stringify(result));
  return {path:'/api/boards/' + result.board.id, key:result.secret};
}
const joined = {action:'join', name:'Demo Subscriber',email:'subscriber@example.com',agree:true};

test('Worker serves the shared UI and restricts creation to invited organizers', async () => {
  const page = await fetch(site + '/');
  assert.equal(page.status,200);
  assert.match(await page.text(), /name="field-kit-mode" content="shared".*name="field-kit-access" content="invite"/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(site + '/app.js')).status, 200);
  assert.equal((await api('POST','/api/boards',{kind:'borrow',title:'Test',days:'5'})).status,403);
  assert.equal((await api('POST','/api/boards',{kind:'borrow',accessCode:code},null,null,'https://elsewhere.example')).status,403);
});

test('D1 lets only one customer claim a slot and keeps the waitlist private', async () => {
  const {path,key}=await create('slot-hub',{title:'Demo Salon',where:'12 King Street'});
  const available = await api('PATCH',path,{action:'new-listing',title:'Gel nails',when:plus(2)},key);
  assert.equal(available.status,200,JSON.stringify(available));
  const listing = available.board.listings[0].id;
  const join = await api('POST',path+'/act',joined);
  assert.equal(join.board.subscribed,true);
  assert.equal((await api('GET',path)).board.contacts,undefined);
  assert.equal((await api('GET',path,null,key)).board.contacts[0].token,undefined);
  const responses = await Promise.all(Array.from({length:4},(_,n)=>
    api('POST',path+'/act',{listing,name:'Test Customer',email:'customer'+n+'@example.com',agree:true})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409,409,409]);
  const receipt = responses.find(r=>r.status===201).receipt;
  assert.equal((await api('GET',path)).board.listings.length,0);
  const detail = path+'?listing='+listing;
  assert.equal((await api('GET',detail)).board.claim,undefined);
  assert((await api('GET',detail,null,null,receipt)).board.receipt);
  assert.equal((await api('POST',path+'/act',{action:'unsubscribe', token:join.receipt})).status,201);
  assert.equal((await api('GET',path,null,key)).board.contacts.length,0);
  assert.equal((await api('PATCH',path,{action:'delete'},key)).status,200);
  assert.equal((await api('GET',path)).status,404);
});

test('D1 retries nonconflicting writes without dropping gear, and rejects double checkout', async () => {
  const {path,key} = await create('borrow',{title:'Demo Equipment',days:2});
  const imports = await Promise.all(['Mat','Helmet','Bag'].map(title=>api('PATCH',path,{action:'add',title},key)));
  assert(imports.every(r=>r.status===200),JSON.stringify(imports));
  const list = await api('GET',path);
  assert.deepEqual(list.board.items.map(i=>i.title).sort(),['Bag','Helmet','Mat']);
  const item = list.board.items[0].id;
  const loan = await Promise.all([1,2].map(n=>api('POST',path+'/act',{item,agree:true,name:'Demo Borrower '+n})));
  assert.deepEqual(loan.map(r=>r.status).sort(),[201,409]);
  const returned = await api('PATCH',path,{action:'return',item},key);
  assert.equal(returned.board.history.length,1);
  assert.equal((await api('GET',path)).board.history,undefined);
  await api('PATCH',path,{action:'delete'},key);
});

test('D1 keeps a venue change visible on a stable program link', async () => {
  const {path,key} = await create('rain-hub',{title:'Demo League',where:'Main Gym'});
  const add = await api('PATCH',path,{action:'new-listing',title:'Practice',when:plus(3)},key);
  const listing = add.board.listings[0].id;
  const update={action:'update',listing,status:'moved',where:'East Gym',note:'Use side door'};
  assert.equal((await api('PATCH',path,update)).status,403);
  assert.equal((await api('PATCH',path,update,key)).status,200);
  assert.equal((await api('GET',path)).board.listings[0].updates[0].where,'East Gym');
  await api('PATCH',path,{action:'delete'},key);
});
