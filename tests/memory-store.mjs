import {FirestoreStore} from '../access/firestore.mjs';
export class MemoryStore extends FirestoreStore {
 constructor(){super('test','test');this.rows=new Map();this.clock=0;}
 async get(c,id){return structuredClone(this.rows.get(c+'/'+id)||null);}
 write(c,id,value,prior){return {c,id,value:structuredClone(value),prior};}
 async commit(writes){
  for(const w of writes){const old=this.rows.get(w.c+'/'+w.id);if(w.prior===null&&old||w.prior?._updateTime&&old?._updateTime!==w.prior._updateTime)throw Object.assign(Error('Conflict'),{status:409});}
  for(const w of writes){const v=structuredClone(w.value);delete v._updateTime;delete v._id;this.rows.set(w.c+'/'+w.id,{...v,_id:w.id,_updateTime:String(++this.clock)});}
 }
 async query(c,{filters=[],order='email',descending=false,limit=101}={}){
  const matches=(v,[field,op,x])=>({EQUAL:v[field]===x,GREATER_THAN:v[field]>x,GREATER_THAN_OR_EQUAL:v[field]>=x,LESS_THAN_OR_EQUAL:v[field]<=x}[op]);
  return [...this.rows.entries()].filter(([k,v])=>k.startsWith(c+'/')&&filters.every(f=>matches(v,f))).map(([,v])=>structuredClone(v)).sort((a,b)=>String(a[order]).localeCompare(String(b[order]))*(descending?-1:1)).slice(0,limit);
 }
}
