/* Firestore REST requests use the signed-in user's token. Security Rules remain authoritative. */
function encode(value) {
  if(value===null||value===undefined)return {nullValue:null};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
}
function decode(v) {
  if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);
  if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;
  if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
  if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
  return null;
}
export class FirestoreStore {
  constructor(project,token){this.root=`projects/${project}/databases/(default)/documents`;this.token=token;}
  async request(suffix,method='GET',body){
    let r;
    try { r=await fetch('https://firestore.googleapis.com/v1/'+this.root+suffix,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)}); }
    catch { throw Object.assign(Error('The database could not be reached. Please try again in a moment.'),{status:503}); }
    if(r.status===404&&method==='GET')return null;
    const j=await r.json().catch(()=>{throw Object.assign(Error('The database returned an unexpected response. Please try again.'),{status:502});});
    if(!r.ok&&j.error?.status==='FAILED_PRECONDITION')throw Object.assign(Error('Database setup is incomplete. Ask the owner to check the Firestore indexes.'),{status:503});
    if(!r.ok){const status=r.status===401?401:r.status===403?403:[409,412].includes(r.status)?409:r.status===429?429:502;
      throw Object.assign(Error(status===409?'Someone changed this data. Export your draft, reload and try again.':status===403?'Firebase denied access. Check approval and the deployed security rules.':status===429?'The free database quota or request limit was reached. Please try again later.':'Firebase could not complete the request.'),{status});}
    return j;
  }
  unpack(doc){return doc?{...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)])),_id:doc.name.split('/').pop(),_updateTime:doc.updateTime}:null;}
  async get(collection,id){return this.unpack(await this.request('/'+collection+'/'+encodeURIComponent(id)));}
  write(collection,id,value,prior){
    const clean=Object.fromEntries(Object.entries(value).filter(([k])=>!k.startsWith('_')));
    const w={update:{name:this.root+'/'+collection+'/'+id,fields:Object.fromEntries(Object.entries(clean).map(([k,v])=>[k,encode(v)]))}};
    if(prior===null)w.currentDocument={exists:false};else if(prior?._updateTime)w.currentDocument={updateTime:prior._updateTime};return w;
  }
  async commit(writes){if(writes.length)await this.request(':commit','POST',{writes});}
  async set(collection,id,value,prior){await this.commit([this.write(collection,id,value,prior)]);return value;}
  async query(collection,{filters=[],order='email',descending=false,limit=101}={}){
    const q={from:[{collectionId:collection}],limit,orderBy:[{field:{fieldPath:order},direction:descending?'DESCENDING':'ASCENDING'}]};
    const f=filters.map(([field,op,value])=>({fieldFilter:{field:{fieldPath:field},op,value:encode(value)}}));
    if(f.length)q.where=f.length===1?f[0]:{compositeFilter:{op:'AND',filters:f}};
    const result=await this.request(':runQuery','POST',{structuredQuery:q});return (result||[]).filter(x=>x.document).map(x=>this.unpack(x.document));
  }
  async directory(scope,withWorkbook=false){
    const d=await this.get('directories',scope);if(!d)return {data:null,workbook:null,revision:0};
    const w=withWorkbook?await this.get('workbooks',scope):null;
    return {data:JSON.parse(d.data_json),workbook:w?.content||null,revision:d.revision,updated_at:d.updated_at};
  }
  async publish(scope,b,actor){
    const old=await this.get('directories',scope);if((old?.revision||0)!==b.revision)throw Object.assign(Error('A newer directory was published. Export your draft, reload and import it before publishing.'),{status:409});
    const now=new Date().toISOString(),writes=[this.write('directories',scope,{data_json:JSON.stringify(b.data),revision:b.revision+1,updated_at:now},old)];
    if(b.workbook!==undefined)writes.push(this.write('workbooks',scope,{content:b.workbook||'',updated_at:now}));
    if(old)writes.push(this.write('history',scope+'-'+old.revision,{scope,revision:old.revision,data_json:old.data_json,updated_at:old.updated_at}));
    writes.push(this.write('audit',crypto.randomUUID(),{actor,action:'directory.publish',target:scope,detail:{revision:b.revision+1},created_at:now},null));
    await this.commit(writes);return {revision:b.revision+1};
  }
}
