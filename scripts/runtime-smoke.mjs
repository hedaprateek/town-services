/* Native Cloudflare asset-routing check. Synthetic identity/store; no production DB access. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {unstable_dev} from 'wrangler';
const source=path.resolve(import.meta.dirname,'..'),configPath=path.resolve('wrangler.jsonc');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const dir=path.join(source,'.cache','worker-runtime');fs.mkdirSync(dir,{recursive:true});
const entry=path.join(dir,'synthetic-entry.mjs');
fs.writeFileSync(entry,`import {createHandler} from '../../access/worker.mjs';
import {MemoryStore} from '../../tests/memory-store.mjs';
const store=new MemoryStore();
export default {fetch:createHandler(async(token)=>{if(token!=='runtime-owner')throw Error('Sign in');return {uid:'runtime-owner',email:'prateekbct@gmail.com',name:'Runtime owner fixture',expires:Math.floor(Date.now()/1000)+3600};},()=>store)};`);
let worker;
try{
 worker=await unstable_dev(entry,{config:configPath,local:true,logLevel:'error',experimental:{disableExperimentalWarning:true,disableDevRegistry:true}});
 const base='http://127.0.0.1:'+worker.port;
 const request=(p,owner=false)=>fetch(base+p,{redirect:'manual',headers:owner?{Authorization:'Bearer runtime-owner'}:{},signal:AbortSignal.timeout(10000)});
 const login=await request('/signin.html');assert.equal(login.status,200,'Login HTML must not redirect to an unsupported clean URL.');assert.match(await login.text(),/Continue with Google/);
 const root=await request('/');assert.equal(root.status,302);assert.equal(new URL(root.headers.get('location')).searchParams.get('return'),'/'+config.vars.DEFAULT_DIRECTORY+'/');
 for(const p of ['/town/','/society/','/admin/','/town/admin.html','/society/admin.html']){
  const denied=await request(p);assert.equal(denied.status,302,'Anonymous page gate: '+p);
  const allowed=await request(p,true);assert.equal(allowed.status,200,'Approved HTML route must serve directly: '+p);assert.match(allowed.headers.get('content-type'),/text\/html/);assert.match(allowed.headers.get('cache-control'),/no-store/);assert.match(await allowed.text(),/DirectoryAccess/);
 }
 for(const p of ['/data.xlsx','/directory.json','/services.json','/wrangler.jsonc','/.community/index.html'])assert.equal((await request(p,true)).status,404,'Source data exposed: '+p);
 for(const scope of ['town','society'])assert.equal((await request('/api/directory/'+scope)).status,401);
 console.log('Native Cloudflare runtime passed: login, approved viewer/editor/admin HTML, anonymous gates, asset routing and source protection. Identity and database are synthetic.');
}finally{if(worker)await worker.stop();}
