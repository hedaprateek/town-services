/* Public, read-only smoke check. Does not sign in or read any private contact data. */
import assert from 'node:assert/strict';
const target=process.argv[2];
if(!target){console.error('Usage: npm run check:deployment -- https://YOUR-WORKER.workers.dev');process.exit(1);}
const url=new URL(target);
assert.equal(url.protocol,'https:','Use the final HTTPS website address.');
const base=url.origin;
async function request(path){return fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(30000)});}
try{
 const health=await request('/health');assert.equal(health.status,200,'The Worker health endpoint is unavailable.');
 assert.equal((await health.json()).configured,true,'Firebase configuration is missing.');
 const configResponse=await request('/api/config');assert.equal(configResponse.status,200);const config=await configResponse.json();
 assert.equal(config.configured,true);assert.equal(config.firebase.projectId,'community-directory-88fc7','Unexpected Firebase project.');
 const root=await request('/');assert.equal(root.status,302);assert.match(root.headers.get('location'),/\/signin\.html/);
 for(const scope of ['society','town']){
  const page=await request('/'+scope+'/');assert.equal(page.status,302,'Anonymous '+scope+' pages must require sign-in.');assert.match(page.headers.get('location'),/\/signin\.html/);
  const api=await request('/api/directory/'+scope);assert.equal(api.status,401,'Anonymous '+scope+' data requests must be denied.');assert.match(api.headers.get('cache-control'),/no-store/);
 }
 for(const path of ['/data.xlsx','/directory.json','/services.json','/services.xlsx','/wrangler.jsonc','/private-data/initial-import.json','/.community/index.html']){
  assert.equal((await request(path)).status,404,'Source or live-data file exposed: '+path);
 }
 const settings=await fetch('https://identitytoolkit.googleapis.com/v1/projects?key='+encodeURIComponent(config.firebase.apiKey),{signal:AbortSignal.timeout(30000)});
 assert.equal(settings.status,200,'The Firebase web API key is not accepted.');const google=await settings.json();
 assert.ok(google.authorizedDomains?.includes(url.hostname),'Add '+url.hostname+' to Firebase Authentication → Settings → Authorized domains.');
 console.log('PASS: Worker configuration, Google hostname authorization, sign-in gates, private API responses, no-cache headers and source-file protection.');
 console.log('Still required: sign in as the owner, import data, and test a real viewer approval, block and document download.');
}catch(error){console.error('FAIL:',error.message);process.exitCode=1;}
