import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from './memory-store.mjs';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyIdentity } from '../access/auth.mjs';
import { createHandler } from '../access/worker.mjs';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey); jwk.kid = 'local-key';
const keys = createLocalJWKSet({ keys: [jwk] });
const project = 'directory-access-test';
async function token(email, uid = email, extra = {}) {
  return new SignJWT({ email, email_verified: true, name: 'Test resident', firebase: { sign_in_provider: 'google.com' }, auth_time: Math.floor(Date.now()/1000), ...extra })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-key' }).setSubject(uid).setIssuedAt().setExpirationTime(extra.exp ?? '1h')
    .setIssuer('https://securetoken.google.com/' + project).setAudience(project).sign(privateKey);
}
function fixture() {
  const store=new MemoryStore();
  const env={ OWNER_EMAIL:'owner@example.com', FIREBASE_PROJECT_ID:project,
    FIREBASE_API_KEY:'test-key', FIREBASE_AUTH_DOMAIN:project+'.firebaseapp.com', FIREBASE_APP_ID:'test-app',
    ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname.endsWith('.json')?'not found':'<html>page</html>',{status:new URL(request.url).pathname.endsWith('.json')?404:200})} };
  const fetch=createHandler((t,p)=>verifyIdentity(t,p,keys),()=>store);
  async function request(path,t,method='GET',value,origin='https://directory.test') {
    const headers={};if(t)headers.Authorization='Bearer '+t;if(method!=='GET')headers.Origin=origin;
    if(value!==undefined)headers['Content-Type']='application/json';
    return fetch(new Request('https://directory.test'+path,{method,headers,body:value===undefined?undefined:JSON.stringify(value)}),env);
  }
  return {env,request,store};
}
const town={title:'Town',columns:['Name','Phone'],rows:[{Name:'Plumber',Phone:'123'}],sponsors:[]};
const society={meta:{name:'Our society'},sections:[{id:'residents',title:'Residents',cols:['Name'],rows:[{Name:'Test resident'}],map:{name:'Name',phone:[],place:[],rest:[],owner:{phone:[],address:[],other:[]}}}],notes:{},hindi:{},group:{}};

test('JWT verification rejects expired, unverified, wrong-provider, wrong-audience, forged and unsigned identities',async()=>{
  const good=await token('resident@example.com');assert.equal((await verifyIdentity(good,project,keys)).email,'resident@example.com');
  for(const claims of [{email_verified:false},{firebase:{sign_in_provider:'password'}},{auth_time:Date.now()/1000+3600},{exp:Math.floor(Date.now()/1000)-60}])await assert.rejects(verifyIdentity(await token('resident@example.com','resident',claims),project,keys));
  await assert.rejects(verifyIdentity(good,'other-project',keys));
  await assert.rejects(verifyIdentity(good.slice(0,-8)+'forged00',project,keys));
  await assert.rejects(verifyIdentity('eyJhbGciOiJub25lIn0.e30.',project,keys));
});
test('unauthenticated requests and unconfigured deployments fail closed',async()=>{
  const {env,request}=fixture();assert.equal((await request('/api/directory/town')).status,401);
  const page=await request('/society/materials/private.pdf');assert.equal(page.status,302);assert.match(page.headers.get('location'),/signin/);
  env.FIREBASE_PROJECT_ID=undefined;assert.equal((await request('/api/directory/town',await token('owner@example.com'))).status,503);
  assert.equal((await (await request('/api/config')).json()).configured,false);
});
test('only the configured owner bootstraps administration; session cookie is secure and private',async()=>{
  const {request}=fixture();const owner=await token('owner@example.com');
  const r=await request('/api/session',owner,'POST'),j=await r.json();assert.equal(j.user.role,'owner');assert.equal(j.user.status,'approved');
  assert.match(r.headers.get('set-cookie'),/^__Host-directory-session=.*HttpOnly; Secure; SameSite=Lax/);assert.match(r.headers.get('cache-control'),/no-store/);
  const other=await request('/api/session',await token('other@example.com'),'POST');assert.equal((await other.json()).user.role,'member');
});
test('preapproved emails bind only to their verified UID and grant only selected scopes',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com'),viewer=await token('viewer@example.com','viewer-id');
  assert.equal((await request('/api/admin/invite',owner,'POST',{members:[{email:'viewer@example.com',scopes:['town']}]})).status,200);
  const me=await (await request('/api/me',viewer)).json();assert.equal(me.user.uid,'viewer-id');assert.deepEqual(me.user.scopes,['town']);
  assert.equal((await request('/api/directory/society',viewer)).status,403);
  assert.equal((await request('/api/me',await token('viewer@example.com','different-uid'))).status,409);
  assert.equal((await request('/api/admin/members',viewer)).status,403);
  assert.equal((await request('/society/admin.html',viewer)).status,302);
});
test('new registrations cannot approve themselves, grant access or reset a blocked status',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com'),viewer=await token('new@example.com');
  assert.equal((await request('/api/register',viewer,'POST',{name:'Neighbour',scopes:['society'],status:'approved',role:'owner'})).status,200);
  let me=(await (await request('/api/me',viewer)).json()).user;assert.equal(me.status,'pending');assert.equal(me.role,'member');assert.deepEqual(me.scopes,[]);
  assert.equal((await request('/api/directory/society',viewer)).status,403);
  await request('/api/admin/member',owner,'PATCH',{email:me.email,status:'blocked',role:'member',scopes:[]});
  assert.equal((await request('/api/register',viewer,'POST',{name:'Neighbour',scopes:['society']})).status,403);
});
test('cross-origin mutations are rejected even with valid credentials',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com');
  for(const origin of ['https://attacker.test','null',''])assert.equal((await request('/api/admin/invite',owner,'POST',{members:[{email:'person@example.com',scopes:['town']}]},origin)).status,403);
});
test('blocking an approved viewer stops their next data request with the same valid token',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com'),viewer=await token('viewer@example.com');
  await request('/api/admin/invite',owner,'POST',{members:[{email:'viewer@example.com',scopes:['town']}]});
  assert.equal((await request('/api/admin/directory/town',owner,'PUT',{data:town,revision:0})).status,200);
  assert.equal((await request('/api/directory/town',viewer)).status,200);
  await request('/api/admin/member',owner,'PATCH',{email:'viewer@example.com',status:'blocked',scopes:[],role:'member'});
  assert.equal((await request('/api/directory/town',viewer)).status,403);
});
test('only the owner appoints admins; admin cannot modify owner or other admins',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com'),other=await token('admin@example.com');
  await request('/api/me',owner);await request('/api/me',other);
  await request('/api/admin/member',owner,'PATCH',{email:'admin@example.com',status:'approved',scopes:['society'],role:'admin'});
  assert.equal((await request('/api/admin/member',other,'PATCH',{email:'owner@example.com',status:'blocked',scopes:[],role:'member'})).status,403);
  await request('/api/me',await token('person@example.com'));
  assert.equal((await request('/api/admin/member',other,'PATCH',{email:'person@example.com',status:'approved',scopes:['town'],role:'admin'})).status,403);
});
test('Firestore publishing uses revision checks, preserves the workbook and history, and rejects private fields',async()=>{
  const {request,store}=fixture(),owner=await token('owner@example.com');
  assert.equal((await request('/api/admin/directory/society',owner,'PUT',{data:society,revision:0,workbook:'d29ya2Jvb2s='})).status,200);
  assert.equal((await request('/api/admin/directory/society',owner,'PUT',{data:society,revision:0})).status,409);
  assert.equal((await request('/api/admin/directory/society',owner,'PUT',{data:{...society,meta:{name:'Updated'}},revision:1,workbook:'d29ya2Jvb2s='})).status,200);
  const backup=await request('/api/admin/backup',owner);assert.equal(backup.status,200);
  const saved=await backup.json();assert.equal(saved.documents.find(d=>d.scope==='society').revision,2);assert.equal(saved.documents.find(d=>d.scope==='society').workbook,'d29ya2Jvb2s=');assert.ok(!JSON.stringify(saved).includes('Bearer'));
  assert.equal((await store.get('history','society-1')).revision,1);
  const bad=structuredClone(society);bad.sections[0].rows[0]._Secret='private';
  assert.equal((await request('/api/admin/directory/society',owner,'PUT',{data:bad,revision:2})).status,400);
  assert.equal((await request('/api/admin/directory/town',owner,'PUT',{data:{...town,rows:[]},revision:0})).status,400);
});
test('repeat invitations preserve existing blocks and permissions; invalid batch cannot partially approve',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com');
  await request('/api/admin/invite',owner,'POST',{members:[{email:'person@example.com',scopes:['town']}]});
  await request('/api/admin/member',owner,'PATCH',{email:'person@example.com',status:'blocked',role:'member',scopes:[]});
  const result=await (await request('/api/admin/invite',owner,'POST',{members:[{email:'person@example.com',scopes:['society']}]})).json();assert.equal(result.skipped,1);
  assert.equal((await (await request('/api/me',await token('person@example.com'))).json()).user.status,'blocked');
  assert.equal((await request('/api/admin/invite',owner,'POST',{members:[{email:'good@example.com',scopes:['town']},{email:'invalid',scopes:['town']}]})).status,400);
  const list=await (await request('/api/admin/members',owner)).json();assert.ok(!list.members.some(m=>m.email==='good@example.com'));
});
test('protected materials require society approval and disallow HTML or executable uploads',async()=>{
  const {request}=fixture(),owner=await token('owner@example.com'),viewer=await token('town@example.com');
  await request('/api/admin/invite',owner,'POST',{members:[{email:'town@example.com',scopes:['town']}]});
  assert.equal((await request('/api/admin/material?name=unsafe.html',owner,'PUT',{content:btoa('<script>bad</script>')})).status,400);
  assert.equal((await request('/api/admin/material?name=notice.pdf',owner,'PUT',{content:btoa('%PDF-test')})).status,200);
  assert.equal((await request('/society/materials/notice.pdf',viewer)).status,302);
  const file=await request('/society/materials/notice.pdf',owner);assert.equal(file.headers.get('content-type'),'application/pdf');assert.equal(await file.text(),'%PDF-test');
  assert.equal((await request('/api/admin/backup',viewer)).status,403);
});
test('every returned response disables caching, and unknown source-file routes are blocked',async()=>{
  const {request}=fixture();for(const path of ['/api/config','/access.js','/wrangler.jsonc','/services.xlsx','/.dev.vars','/private-data/town.json']){
    const r=await request(path);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    if(path.includes('wrangler')||path.endsWith('xlsx')||path.includes('.dev')||path.includes('private-data'))assert.equal(r.status,404);
  }
});
