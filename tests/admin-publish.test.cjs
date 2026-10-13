const test=require('node:test'),assert=require('node:assert/strict');
const {publish}=require('../admin-publish.js');
const baseline={title:'Local Services',rows:[{Name:'Rahul',Phone:'1234567890'}]};
function mock({changed=false,race=false,failedBlob=false}={}){
  const calls=[];let refs=0;
  const fetch=async(url,options)=>{
    const path=url.replace('https://api.github.com/repos/owner/town','');
    const body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method,body});
    let json={};
    if(path==='/git/ref/heads/main')json={object:{sha:++refs>1&&race?'newer':'parent'}};
    else if(path.startsWith('/contents/'))json={content:Buffer.from(JSON.stringify(changed?{...baseline,title:'Newer edit'}:baseline)).toString('base64')};
    else if(path==='/git/commits/parent')json={tree:{sha:'old-tree'}};
    else if(path==='/git/blobs'){
      if(failedBlob)return {ok:false,status:403,json:async()=>({message:'Permission denied'})};
      json={sha:body.content};
    }else if(path==='/git/trees')json={sha:'new-tree'};
    else if(path==='/git/commits')json={sha:'new-commit'};
    return {ok:true,json:async()=>json};
  };
  return {calls,fetch};
}
function options(fetch){return {repo:'owner/town',token:'mock-token',baseline,fetch,files:[
  {path:'services.json',content:'json-blob'},{path:'services.xlsx',content:'xlsx-blob'}]};}
test('publishes JSON and workbook in one tree and one non-forced branch update',async()=>{
  const client=mock();assert.equal(await publish(options(client.fetch)),'new-commit');
  const tree=client.calls.find(call=>call.path==='/git/trees');assert.equal(tree.body.base_tree,'old-tree');
  assert.deepEqual(tree.body.tree.map(file=>file.path),['services.json','services.xlsx']);
  const updates=client.calls.filter(call=>call.method==='PATCH');assert.equal(updates.length,1);
  assert.deepEqual(updates[0].body,{sha:'new-commit',force:false});
});
test('stale directory is rejected before any write',async()=>{
  const client=mock({changed:true});await assert.rejects(publish(options(client.fetch)),/changed on GitHub/);
  assert.ok(client.calls.every(call=>call.method==='GET'));
});
test('a concurrent commit is retained instead of overwriting the branch',async()=>{
  const client=mock({race:true});await assert.rejects(publish(options(client.fetch)),/another update/);
  assert.ok(!client.calls.some(call=>call.method==='PATCH'));
});
test('failed file preparation never updates the published branch',async()=>{
  const client=mock({failedBlob:true});await assert.rejects(publish(options(client.fetch)),/Permission denied/);
  assert.ok(!client.calls.some(call=>call.method==='PATCH'));
});
