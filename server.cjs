'use strict';
const http=require('node:http'),{DatabaseSync}=require('node:sqlite'),{randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {mkdirSync,readFileSync}=require('node:fs'),{join,dirname}=require('node:path');
const domain=require('./public/domain.js');
const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/studio.css':['studio.css','text/css'],'/app.js':['app.js','text/javascript'],'/domain.js':['domain.js','text/javascript'],'/qr.js':['qr.js','text/javascript'],'/qr-license.txt':['qr-license.txt','text/plain'],'/slot.svg':['slot.svg','image/svg+xml'],'/borrow.svg':['borrow.svg','image/svg+xml'],'/rain.svg':['rain.svg','image/svg+xml']};
const id=()=>randomBytes(12).toString('base64url');
const key=()=>randomBytes(24).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest();
const owns=(req,row)=>{
 const value=req.headers.authorization||'';
 return /^Bearer [A-Za-z0-9_-]{32}$/.test(value)&&timingSafeEqual(hash(value.slice(7)),Buffer.from(row.secret,'hex'));
};
const limits=(cap,ms)=>{
 const seen=new Map();
 return k=>{
  const now=Date.now(),bucket=seen.get(k);
  if(seen.size>=10000||Math.random()<.01){for(const [a,b] of seen)if(b.until<=now)seen.delete(a);}
  if(!bucket&&seen.size>=10000)domain.fail('Try again shortly.',429);
  if(!bucket||bucket.until<=now){seen.set(k,{count:1,until:now+ms});return;}
  if(bucket.count>=cap)domain.fail('Too many requests. Try again in a minute.',429);
  bucket.count++;
 };
};
const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function reply(res,status,content,type='application/json'){
 res.writeHead(status,{...headers,'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});
 res.end(type==='application/json'?JSON.stringify(content):content);
}
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))domain.fail('Send JSON.',415);
 let total=0,tooBig=false;const parts=[];
 for await(const bytes of req){
  total+=bytes.length;
  if(total>8192){tooBig=true;parts.length=0;}else if(!tooBig)parts.push(bytes);
 }
 if(tooBig)domain.fail('Request is too large.',413);
 try{const v=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}
 catch{domain.fail('Invalid request.',400);}
}
function createServer({dbPath=process.env.DB_PATH||join(__dirname,'data','pilots.sqlite'),publicOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL,accessCode=process.env.PILOT_ACCESS_CODE}={}){
 const sharedIndex=readFileSync(join(__dirname,'public','index.html'),'utf8').replace('name="field-kit-mode" content="preview"','name="field-kit-mode" content="shared"').replace('name="field-kit-access" content="open"','name="field-kit-access" content="'+(accessCode?'invite':'open')+'"');
 if(dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, secret TEXT NOT NULL, data TEXT NOT NULL)');
 const read=db.prepare('SELECT * FROM boards WHERE id=?'), insert=db.prepare('INSERT INTO boards(id,secret,data) VALUES(?,?,?)'), update=db.prepare('UPDATE boards SET data=? WHERE id=?'), remove=db.prepare('DELETE FROM boards WHERE id=?');
 const set=create=>{db.exec('BEGIN IMMEDIATE');try{const result=create();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const limitCreate=limits(50,60000), limitWrite=limits(45,60000);
 function load(id){const row=read.get(id);if(!row)domain.fail('This page could not be found.',404);return {row,b:JSON.parse(row.data)};}
 const server=http.createServer({requestTimeout:15000,headersTimeout:10000,maxHeaderSize:12000},async(req,res)=>{
  try{
   const u=new URL(req.url,'http://local');
   const pathname=u.pathname, method=req.method;
   if(method==='GET'&&Object.hasOwn(files,pathname)){
    const [file,type]=files[pathname];reply(res,200,type==='text/html'?sharedIndex:readFileSync(join(__dirname,'public',file)),type);return;
   }
   if(method==='GET'&&pathname==='/api/status'){reply(res,200,{shared:true});return;}
   if(!pathname.startsWith('/api/'))domain.fail('Page not found.',404);
   if(method!=='GET'){
    const origin=req.headers.origin;
    const allowed=publicOrigin?[publicOrigin]:['http://'+req.headers.host,'https://'+req.headers.host];
    if(origin&&!allowed.includes(origin))domain.fail('Use the same site to submit.',403);
   }
   const time=()=>new Date().toISOString();
   if(method==='POST'&&pathname==='/api/boards'){
    limitCreate(req.socket.remoteAddress||'shared');const input=await body(req);
    if(accessCode&&(typeof input.accessCode!=='string'||!timingSafeEqual(hash(input.accessCode),hash(accessCode))))domain.fail('Enter the pilot access code to publish a new page.',403);
    const secret=key(), t=time(), b=domain.create(input,t,id);
    insert.run(b.id,hash(secret).toString('hex'),JSON.stringify(b));reply(res,201,{board:domain.present(b,t,true),secret});return;
   }
   const m=pathname.match(/^\/api\/boards\/([A-Za-z0-9_-]{16})(\/act)?$/);
   if(!m)domain.fail('Page not found.',404);
   const [,boardId,action]=m;
   if(method==='GET'&&!action){
    const {row,b}=load(boardId), auth=req.headers.authorization;
    if(auth&&!owns(req,row))domain.fail('That private manager link does not match this board.',403);
    const receipt=req.headers['x-receipt'];
    reply(res,200,{board:domain.present(b,time(),owns(req,row),typeof receipt==='string'?receipt:undefined,u.searchParams.get('listing'))});return;
   }
   if(method==='POST'&&action){
    limitWrite(boardId);const input=await body(req);
    const result=set(()=>{const {b}=load(boardId), t=time();const receipt=domain.action(b,input,t,id,key);update.run(JSON.stringify(b),b.id);return {board:domain.present(b,t,false,receipt,input.listing),receipt};});
    reply(res,201,result);return;
   }
   if(method==='PATCH'&&!action){
    const input=await body(req);
    const result=set(()=>{
     const {row,b}=load(boardId);if(!owns(req,row))domain.fail('Use your private manager link.',403);
     limitWrite(boardId+':owner');
     if(input.action==='delete'&&!input.listing){remove.run(b.id);return null;}
     const t=time();domain.modify(b,input,t,id);
     update.run(JSON.stringify(b),b.id);return domain.present(b,t,true,undefined,input.action==='delete-listing'?undefined:input.listing);
    });
    reply(res,200,{board:result});return;
   }
   domain.fail('Method not allowed.',405);
  }catch(e){if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'Something went wrong. Try again.'});if(!e.status)console.error(e);}
 });
 server.on('close',()=>db.close());return server;
}
if(require.main===module){
 const server=createServer();
 server.listen(Number(process.env.PORT||8433),process.env.HOST||'127.0.0.1',()=>console.log('Three Pilots listening at '+JSON.stringify(server.address())));
}
module.exports={createServer};
