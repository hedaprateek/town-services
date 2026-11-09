import {test} from 'node:test';import assert from 'node:assert/strict';import {FirestoreStore} from '../access/firestore.mjs';
test('Firestore REST client forwards only the viewer token and decodes stored fields',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.match(url,/firestore.googleapis.com\/v1\/projects\/test-project\/databases/);assert.equal(options.headers.Authorization,'Bearer user-token');return Response.json({name:'projects/test-project/databases/(default)/documents/members/person@example.com',updateTime:'version',fields:{email:{stringValue:'person@example.com'},uid:{nullValue:null},scopes:{arrayValue:{values:[{stringValue:'town'}]}},revision:{integerValue:'2'}}});});
 const db=new FirestoreStore('test-project','user-token'),m=await db.get('members','person@example.com');assert.deepEqual(m.scopes,['town']);assert.equal(m.revision,2);assert.equal(m.uid,null);assert.equal(m._updateTime,'version');
});
test('Firestore publication commits data, workbook, prior version and audit together with a concurrency precondition',async t=>{
 let committed;t.mock.method(globalThis,'fetch',async(url,options)=>{if(url.endsWith(':commit')){committed=JSON.parse(options.body);return Response.json({writeResults:[]});}return Response.json({name:'projects/test-project/databases/(default)/documents/directories/town',updateTime:'old-update-time',fields:{data_json:{stringValue:'{"title":"Old"}'},revision:{integerValue:'1'},updated_at:{stringValue:'yesterday'}}});});
 const db=new FirestoreStore('test-project','user-token');const r=await db.publish('town',{data:{title:'New'},revision:1,workbook:'Ynl0ZXM='},'admin@example.com');assert.equal(r.revision,2);assert.equal(committed.writes.length,4);assert.equal(committed.writes[0].currentDocument.updateTime,'old-update-time');assert.equal(committed.writes[1].update.fields.content.stringValue,'Ynl0ZXM=');assert.match(committed.writes[2].update.name,/history\/town-1$/);assert.match(committed.writes[3].update.name,/audit\//);assert.ok(!JSON.stringify(committed).includes('_updateTime'));
});
test('a missing Firebase database or failed commit never reports successful publishing',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:{status:'NOT_FOUND'}},{status:404}));
 const db=new FirestoreStore('test-project','user-token');assert.equal(await db.get('directories','town'),null);await assert.rejects(db.commit([db.write('directories','town',{revision:1},null)]));
});

test('database outages, malformed responses, quota exhaustion and missing indexes return actionable failures',async t=>{
 const db=new FirestoreStore('test-project','user-token');
 const cases=[
  [async()=>{throw Error('network unavailable');},503,/database could not be reached/],
  [async()=>new Response('<html>upstream unavailable</html>',{status:502}),502,/unexpected response/],
  [async()=>Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429}),429,/quota/],
  [async()=>Response.json({error:{status:'FAILED_PRECONDITION'}},{status:400}),503,/Firestore indexes/]
 ];
 for(const [response,status,message]of cases){const mock=t.mock.method(globalThis,'fetch',response);await assert.rejects(db.get('directories','town'),e=>e.status===status&&message.test(e.message));mock.mock.restore();}
});
