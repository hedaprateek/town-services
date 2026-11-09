import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import vm from 'node:vm';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';import {createHandler} from '../access/worker.mjs';import {verifyIdentity} from '../access/auth.mjs';import {MemoryStore} from '../tests/memory-store.mjs';
const require=createRequire(import.meta.url),XLSX=require('../access/vendor/xlsx.full.min.js');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.cache','private-browser');fs.mkdirSync(out,{recursive:true});
const project='directory-browser-test',ownerEmail='prateekbct@gmail.com';
const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='browser';const keys=createLocalJWKSet({keys:[jwk]});
const tokens={};for(const [role,email]of Object.entries({owner:ownerEmail,pending:'pending@example.com'}))tokens[role]=await new SignJWT({email,email_verified:true,name:role,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(Date.now()/1000)}).setProtectedHeader({alg:'RS256',kid:'browser'}).setIssuer('https://securetoken.google.com/'+project).setAudience(project).setSubject(role).setIssuedAt().setExpirationTime('1h').sign(privateKey);
const store=new MemoryStore(),env={OWNER_EMAIL:ownerEmail,FIREBASE_PROJECT_ID:project,FIREBASE_API_KEY:'fixture',FIREBASE_AUTH_DOMAIN:project+'.firebaseapp.com',FIREBASE_APP_ID:'fixture'};
const parser={window:{},XLSX};vm.runInNewContext(fs.readFileSync(path.join(root,'dist/society/workbook-parser.js'),'utf8'),parser);
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Field','Value'],['Society Name','Test Society']]),'About');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Name:'Example Resident',Phone:'9000000001',Flat:'A-1'}]),'Residents');const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'});
await store.publish('society',{data:parser.window.SocietyWorkbook.parse(bytes),workbook:Buffer.from(bytes).toString('base64'),revision:0},ownerEmail);
await store.publish('town',{data:{title:'Local Services & Help',city:'Test Town',theme:'civic',country:'91',columns:['Name','Role','Phone'],rows:[{Name:'Example Plumber',Role:'Plumber',Phone:'9000000002'}],sponsors:[]},revision:0},ownerEmail);
const handler=createHandler((t,p)=>verifyIdentity(t,p,keys),()=>store);
let failSession=false,failTownImport=false,expiredRead=false;
const fakeAuth=`const tokens=${JSON.stringify(tokens)};export const browserLocalPersistence={},inMemoryPersistence={};export function getAuth(){return {}};export async function setPersistence(){};export function onAuthStateChanged(a,cb){queueMicrotask(()=>{const r=localStorage.getItem('qa_role');cb(r?{getIdToken:async()=>tokens[r]}:null)});return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){if(localStorage.getItem('qa_popup_blocked'))throw Object.assign(Error('Popup blocked'),{code:'auth/popup-blocked'});localStorage.setItem('qa_role','owner')};export async function signOut(){localStorage.removeItem('qa_role')};`;
const server=http.createServer(async(req,res)=>{try{
 const origin='http://127.0.0.1:'+server.address().port,p=new URL(req.url,origin).pathname;
 if(p.startsWith('/firebase-test/')){res.setHeader('Content-Type','text/javascript');res.end(p.endsWith('firebase-app.js')?'export function initializeApp(x){return x}':fakeAuth);return;}
 if(failSession&&p==='/api/session'||failTownImport&&p==='/api/admin/directory/town'&&req.method==='PUT'){
  if(p!=='/api/session')failTownImport=false;
  res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The database could not be reached. Please try again in a moment.'}));return;
 }
 if(expiredRead&&p==='/api/directory/society'){expiredRead=false;res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Session expired'}));return;}
 env.ASSETS={fetch:async request=>{let rel=new URL(request.url).pathname;if(rel.endsWith('/'))rel+='index.html';const full=path.resolve(root,'dist','.'+rel);if(!full.startsWith(path.join(root,'dist')+path.sep)||!fs.existsSync(full))return new Response('Not found',{status:404});const ext=path.extname(full),types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};let b=fs.readFileSync(full);if(rel==='/access.js')b=Buffer.from(b.toString().replace("'https://www.gstatic.com/firebasejs/13.2.0/'",JSON.stringify(origin+'/firebase-test/')));return new Response(b,{headers:{'Content-Type':types[ext]||'application/octet-stream'}});}};
 const chunks=[];for await(const c of req)chunks.push(c);const r=await handler(new Request(origin+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env);
 res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end('Local QA error: '+e.message);}});await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
const executable=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome');
const profile=path.join(out,'profile-'+Date.now());const chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',...(process.platform==='linux'?['--no-sandbox']:[]),'--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let pages;for(let i=0;i<80;i++){try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break;}catch{}await sleep(100);}assert.ok(pages,'Chrome started');
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.addEventListener('open',yes,{once:true});socket.addEventListener('error',no,{once:true});});let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 async function click(selector){
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`);
  assert.ok(point,'Control is visible and enabled: '+selector);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 }
 async function until(expression){for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await sleep(100);}console.log(await evaluate('JSON.stringify({path:location.pathname,message:document.querySelector("#message")?.textContent,body:document.body.textContent.slice(0,900)})'));throw Error('Timed out: '+expression);}
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*cloudflareinsights.com*']});await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.confirm=()=>true;'});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:base+'/signin.html'});await until('document.querySelector("#google")&&!document.querySelector("#google").hidden');
 fs.writeFileSync(path.join(out,'google-login-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await evaluate('localStorage.setItem("qa_popup_blocked","yes")');await click('#google');await until('document.querySelector("#message").textContent.includes("Allow the Google sign-in popup")');
 await evaluate('localStorage.removeItem("qa_popup_blocked")');await click('#google');await until('Array.from(document.querySelectorAll("#links a")).some(a=>a.pathname==="/admin/")');
 failSession=true;await send('Page.reload');await until('!document.querySelector("#recovery").hidden&&document.querySelector("#message").textContent.includes("database could not be reached")');
 await click('#reset');await until('!document.querySelector("#google").hidden');failSession=false;
 await click('#google');await until('Array.from(document.querySelectorAll("#links a")).some(a=>a.pathname==="/admin/")');
 fs.writeFileSync(path.join(out,'signin.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await send('Page.navigate',{url:base+'/admin/'});await until('document.querySelector("#message")?.textContent.includes("Signed in as")');
 assert.equal(await evaluate('document.querySelector("#status").options.length'),6);
 const migration={documents:await Promise.all(['society','town'].map(async scope=>({scope,...await store.directory(scope,true)}))),materials:[]};
 const migrationPath=path.join(out,'migration-fixture.json');fs.writeFileSync(migrationPath,JSON.stringify(migration));
 for(const scope of ['society','town']){store.rows.delete('directories/'+scope);store.rows.delete('workbooks/'+scope);}
 const document=await send('DOM.getDocument'),fileInput=await send('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#initialFile'});
 failTownImport=true;await send('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[migrationPath]});await until('document.querySelector("#message").textContent.includes("Initial import:")');
 assert.equal((await store.directory('society')).revision,1);assert.equal((await store.directory('town')).revision,0);
 await send('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[migrationPath]});await until('document.querySelector("#message").textContent.includes("Import complete:")');
 assert.equal((await store.directory('society')).revision,1);assert.equal((await store.directory('town')).revision,1);
 fs.writeFileSync(path.join(out,'admin-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await evaluate('document.querySelector("#emails").value="invited@example.com";document.querySelector("#invite").requestSubmit()');await until('document.querySelector("#message").textContent.includes("approved emails added")');
 await send('Page.navigate',{url:base+'/town/admin.html'});await until('document.querySelector("#say")?.textContent.includes("Loaded 1 contacts")');
 await evaluate('document.querySelector("#newContact").click();document.querySelector("#contactName").value="New Electrician";document.querySelector("#contactRole").value="Electrician";document.querySelector("#contactPhone").value="9000000003";document.querySelector("#contactForm").requestSubmit()');await until('document.querySelector("#contactList").textContent.includes("New Electrician")');
 await click('#pubBtn');await until('document.querySelector("#say").textContent.includes("Published.")');assert.equal((await store.directory('town')).data.rows.length,2);
 await send('Page.navigate',{url:base+'/society/admin.html'});await until('document.querySelector("#src")?.textContent.includes("protected directory")');
 assert.equal(await evaluate('Array.from(document.querySelectorAll("h2")).some(e=>e.textContent.includes("Member codes")&&e.getBoundingClientRect().height>0)'),false);
 assert.equal(await evaluate('document.querySelector("#tok").getBoundingClientRect().height'),0);
 fs.writeFileSync(path.join(out,'society-editor-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await click('#pubBtn');await until('document.querySelector("#msg").textContent.includes("Published.")');assert.equal((await store.directory('society')).revision,2);
 await evaluate('localStorage.setItem("qa_role","pending")');await send('Network.clearBrowserCookies');await send('Page.navigate',{url:base+'/signin.html?return=%2Fsociety%2F'});await until('document.querySelector("#register")&&!document.querySelector("#register").hidden');
 await evaluate('document.querySelector("#name").value="Pending Neighbour";document.querySelector("#flat").value="A-2";document.querySelector("#scopeSociety").checked=true;document.querySelector("#register").requestSubmit()');await until('document.querySelector("#message").textContent.includes("waiting for administrator")');
 fs.writeFileSync(path.join(out,'pending.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 const old=await store.get('members','pending@example.com');await store.set('members',old.email,{...old,status:'approved',scopes:['society']},old);
 await evaluate('document.querySelector("#refresh").click()');await until('location.pathname==="/society/"&&document.body.textContent.includes("Test Society")');
 expiredRead=true;assert.equal(await evaluate('(async()=>{const r=await DirectoryAccess.api("/api/directory/society");return r.status})()'),200);
 const blocked=await store.get('members','pending@example.com');await store.set('members',blocked.email,{...blocked,status:'blocked',scopes:[]},blocked);
 await send('Page.reload');await until('location.pathname==="/signin.html"&&document.querySelector("#message")?.textContent.includes("blocked")');
 assert.deepEqual(errors,[]);console.log('Browser checks passed: popup error/retry, failed sign-in recovery, resumable initial import, owner UI, invitations, visible town/society publishing, expired API session retry, pending request, approval and blocking. Google identities are synthetic. Screenshots: .cache/private-browser/');
}finally{socket?.close();chrome.kill();server.close();}
