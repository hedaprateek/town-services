import { credential, verifyIdentity, sessionCookie } from './auth.mjs';
import { FirestoreStore } from './firestore.mjs';

const SCOPES=['society','town'];
const TYPES={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain; charset=utf-8',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const stamp=()=>new Date().toISOString();
class Failure extends Error{constructor(status,message){super(message);this.status=status;}}
function need(test,status,message){if(!test)throw new Failure(status,message);}
function json(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});}
function scopes(value){need(Array.isArray(value)&&value.length<=2&&value.every(s=>SCOPES.includes(s)),400,'Choose society contacts, town services, or both.');return [...new Set(value)].sort();}
function text(value,max=160){need(typeof value==='string'&&value.length<=max,400,'A field is missing or too long.');return value.trim();}
function email(value){const e=text(value,254).toLowerCase();need(/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e),400,'Enter a valid email address.');return e;}
async function body(request,max=1_400_000){
 need(Number(request.headers.get('content-length')||0)<=max,413,'This upload is too large.');
 const reader=request.body?.getReader();need(reader,400,'A request body is required.');const parts=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Failure(413,'This upload is too large.');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Failure(400,'Invalid JSON.');}
}
function publicMember(m){if(!m)return null;return Object.fromEntries(Object.entries(m).filter(([k])=>!k.startsWith('_')));}
function isAdmin(m){return m?.status==='approved'&&['owner','admin'].includes(m.role);}
function allowed(m,scope){return m?.status==='approved'&&(isAdmin(m)||m.scopes.includes(scope));}
async function audit(db,actor,action,target,detail={}){await db.set('audit',crypto.randomUUID(),{actor:actor.email,action,target,detail,created_at:stamp()},null);}
async function identify(request,env,verify,makeStore){
 let identity;try{identity=await verify(credential(request),env.FIREBASE_PROJECT_ID);}catch{throw new Failure(401,'Sign in with Google to continue.');}
 const db=makeStore(env.FIREBASE_PROJECT_ID,credential(request)),now=stamp();
 let user=await db.get('members',identity.email);
 need(!user?.uid||user.uid===identity.uid,409,'This email is linked to another account. Contact the administrator.');
 if(!user){
  const owner=identity.email===String(env.OWNER_EMAIL).toLowerCase();
  user={email:identity.email,uid:identity.uid,name:identity.name,phone:'',society:'',flat:'',reason:'',requested_scopes:[],scopes:owner?SCOPES:[],status:owner?'approved':'new',role:owner?'owner':'member',created_at:now,updated_at:now};
  await db.set('members',identity.email,user,null);
 }else if(!user.uid){const old=user;user={...user,uid:identity.uid,updated_at:now};await db.set('members',identity.email,user,old);}
 return {identity,user,db};
}
function validateDirectory(scope,data){
 need(data&&typeof data==='object'&&!Array.isArray(data),400,'Invalid directory.');
 need(new TextEncoder().encode(JSON.stringify(data)).length<=400_000,413,'The directory exceeds the current upload limit.');
 const rows=scope==='town'?data.rows:data.sections?.flatMap(s=>s.rows||[]);
 need(Array.isArray(rows)&&rows.length>0&&rows.length<=5000,400,'A directory must contain 1–5,000 rows.');
 if(scope==='town')need(typeof data.title==='string'&&Array.isArray(data.columns)&&rows.every(r=>r&&typeof r==='object'&&String(r.Name||r.Person||r.Service||'').trim()),400,'Every town contact needs a name.');
 else{
  need(data.meta?.name&&Array.isArray(data.sections)&&data.sections.length<=100,400,'The society name and sections are required.');
  for(const s of data.sections){
   need(typeof s.id==='string'&&typeof s.title==='string'&&!s.title.startsWith('_')&&Array.isArray(s.rows)&&Array.isArray(s.cols)&&s.cols.every(c=>typeof c==='string'&&!c.startsWith('_')),400,'Private sheets or columns cannot enter the directory.');
   need(s.rows.every(r=>Object.entries(r).every(([k,v])=>!k.startsWith('_')&&!String(v??'').trim().startsWith('_'))),400,'Private values cannot enter the directory.');
  }
 }
}
function secure(response){const h=new Headers(response.headers);h.set('Cache-Control','private, no-store');h.set('Pragma','no-cache');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','same-origin');h.set('X-Frame-Options','DENY');h.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return new Response(response.body,{status:response.status,headers:h});}
export function createHandler(verify=verifyIdentity,makeStore=(p,t)=>new FirestoreStore(p,t)){
 return async function fetchHandler(request,env){const url=new URL(request.url),path=url.pathname;
  try{
   need(!/%2f|%5c/i.test(path),404,'Not found.');
   if(!['GET','HEAD'].includes(request.method))need(request.headers.get('origin')===url.origin,403,'Open this action from the directory website.');
   const configured=!!(env.OWNER_EMAIL&&env.FIREBASE_PROJECT_ID&&env.FIREBASE_API_KEY&&env.FIREBASE_AUTH_DOMAIN&&env.FIREBASE_APP_ID);
   if(path==='/api/config'&&request.method==='GET')return secure(json({configured,firebase:{apiKey:env.FIREBASE_API_KEY,authDomain:env.FIREBASE_AUTH_DOMAIN,projectId:env.FIREBASE_PROJECT_ID,appId:env.FIREBASE_APP_ID}}));
   if(path==='/api/logout'&&request.method==='POST')return secure(json({ok:true},200,{'Set-Cookie':sessionCookie('',0)}));
   if(path.startsWith('/api/')){
    need(configured,503,'Google sign-in is being configured. Please try again after setup.');
    const {identity,user,db}=await identify(request,env,verify,makeStore);
    if(path==='/api/session'&&request.method==='POST')return secure(json({user:publicMember(user)},200,{'Set-Cookie':sessionCookie(credential(request),identity.expires-Math.floor(Date.now()/1000))}));
    if(path==='/api/me'&&request.method==='GET')return secure(json({user:publicMember(user)}));
    if(path==='/api/register'&&request.method==='POST'){
     need(['new','pending'].includes(user.status),403,'Contact the administrator to change this account’s access.');
     const b=await body(request,6000),requested=scopes(b.scopes),name=text(b.name);
     need(name&&requested.length,400,'Enter your name and choose a directory.');
     const updated={...user,name,phone:text(b.phone||'',40),society:text(b.society||''),flat:text(b.flat||'',80),reason:text(b.reason||'',500),requested_scopes:requested,status:'pending',updated_at:stamp()};
     await db.set('members',identity.email,updated,user);return secure(json({user:publicMember(updated)}));
    }
    const directory=path.match(/^\/api\/directory\/(society|town)$/);
    if(directory&&request.method==='GET'){
     need(allowed(user,directory[1]),403,'You do not have access to this directory.');
     const d=await db.directory(directory[1]);need(d.data,404,'The administrator has not published this directory yet.');
     return secure(json(d.data,200,{'X-Directory-Revision':String(d.revision)}));
    }
    need(isAdmin(user),403,'Administrator access is required.');
    if(path==='/api/admin/members'&&request.method==='GET'){
     const after=url.searchParams.get('after')||'',status=url.searchParams.get('status')||'',q=(url.searchParams.get('q')||'').slice(0,100).toLowerCase();
     const filters=[];if(after)filters.push(['email','GREATER_THAN',after]);if(status)filters.push(['status','EQUAL',status]);if(q)filters.push(['email','GREATER_THAN_OR_EQUAL',q],['email','LESS_THAN_OR_EQUAL',q+'\uf8ff']);
     const all=await db.query('members',{filters,limit:101});return secure(json({members:all.slice(0,100).map(publicMember),next:all.length>100?all[99].email:null}));
    }
    if(path==='/api/admin/invite'&&request.method==='POST'){
     const b=await body(request,30_000);need(Array.isArray(b.members)&&b.members.length>0&&b.members.length<=40,400,'Import 1–40 approved emails per request.');
     const entries=b.members.map(m=>({email:email(m.email),name:text(m.name||''),scopes:scopes(m.scopes)}));need(entries.every(e=>e.scopes.length),400,'Choose access for every invited member.');
     const unique=[...new Map(entries.map(e=>[e.email,e])).values()],writes=[];let skipped=0;
     for(const e of unique){if(await db.get('members',e.email)){skipped++;continue;}const now=stamp();writes.push(db.write('members',e.email,{...e,uid:null,phone:'',society:'',flat:'',reason:'',requested_scopes:[],status:'approved',role:'member',created_at:now,updated_at:now},null));}
     await db.commit(writes);await audit(db,user,'invite','members',{added:writes.length,skipped});return secure(json({added:writes.length,skipped}));
    }
    if(path==='/api/admin/member'&&request.method==='PATCH'){
     const b=await body(request,6000),target=email(b.email),access=scopes(b.scopes);
     need(['approved','rejected','blocked','pending'].includes(b.status)&&['member','admin'].includes(b.role),400,'Invalid status or role.');
     need(user.role==='owner'||b.role==='member',403,'Only the owner can appoint administrators.');
     const old=await db.get('members',target);need(old,404,'Member not found.');
     need(old.role!=='owner'&&target!==String(env.OWNER_EMAIL).toLowerCase(),403,'The owner account cannot be changed here.');
     need(user.role==='owner'||old.role==='member',403,'Only the owner can change administrators.');
     need(b.status!=='approved'||access.length||b.role==='admin',400,'Choose at least one directory.');
     await db.set('members',target,{...old,status:b.status,scopes:access,role:b.role,updated_at:stamp()},old);await audit(db,user,'member.update',target,{status:b.status,scopes:access,role:b.role});return secure(json({ok:true}));
    }
    const edit=path.match(/^\/api\/admin\/directory\/(society|town)$/);
    if(edit&&request.method==='GET')return secure(json(await db.directory(edit[1],true)));
    if(edit&&request.method==='PUT'){
     const b=await body(request),scope=edit[1];validateDirectory(scope,b.data);need(Number.isSafeInteger(b.revision)&&b.revision>=0,400,'Reload the current directory before publishing.');
     need(b.workbook==null||typeof b.workbook==='string'&&b.workbook.length<=900_000&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.workbook),400,'Invalid workbook, or it exceeds the 675 KB workbook limit.');
     return secure(json(await db.publish(scope,b,user.email)));
    }
    if(path==='/api/admin/backup'&&request.method==='GET'){
     const members=await db.query('members',{limit:5000}),events=await db.query('audit',{order:'created_at',descending:true,limit:1000}),documents=await Promise.all(SCOPES.map(async scope=>({scope,...await db.directory(scope,true)})));
     return secure(json({version:3,exported:stamp(),members:members.map(publicMember),documents,audit:events.map(publicMember)},200,{'Content-Disposition':'attachment; filename="directory-backup.json"'}));
    }
    if(path==='/api/admin/audit'&&request.method==='GET')return secure(json({events:(await db.query('audit',{order:'created_at',descending:true,limit:100})).map(publicMember)}));
    if(path==='/api/admin/material'&&request.method==='PUT'){
     const name=url.searchParams.get('name')||'',type=TYPES[name.split('.').pop().toLowerCase()];need(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(name)&&type,400,'Use a PDF, Office document, text file, or PNG/JPEG/WebP image.');
     const b=await body(request,1_010_000);need(typeof b.content==='string'&&b.content.length<=1_000_000&&/^[A-Za-z0-9+/]*={0,2}$/.test(b.content),400,'Files must be at most 750 KB.');
     let bytes;try{bytes=atob(b.content);}catch{throw new Failure(400,'Invalid file.');}need(bytes.length>0&&bytes.length<=750_000,413,'Files must be at most 750 KB on the free setup.');
     await db.set('materials',name,{content:b.content,content_type:type,updated_at:stamp()});await audit(db,user,'material.upload',name);return secure(json({path:'materials/'+name}));
    }
    throw new Failure(404,'Not found.');
   }
   if(path==='/'||path==='/index.html')return secure(Response.redirect(url.origin+'/signin.html',302));
   // Reviewed scripts and icons contain no contacts; avoid a database read for each asset.
   if(['/town/directory-core.js','/society/workbook-parser.js','/admin/xlsx.full.min.js','/town/sw.js','/society/sw.js'].includes(path)||/^\/(town|society)\/icons\/[\w.-]+\.(png|svg)$/.test(path)){
    need(['GET','HEAD'].includes(request.method),405,'Method not allowed.');return secure(await env.ASSETS.fetch(request));
   }
   if(path.startsWith('/town/')||path.startsWith('/society/')||path.startsWith('/admin/')){
    const scope=path.startsWith('/town/')?'town':'society',editor=path.startsWith('/admin/')||/\/admin\.html$/.test(path);
    let session;try{need(configured,503,'Setup is incomplete.');session=await identify(request,env,verify,makeStore);need(editor?isAdmin(session.user):allowed(session.user,scope),403,'Access requires approval.');}
    catch(e){if([401,403,503].includes(e.status))return secure(Response.redirect(url.origin+'/signin.html?return='+encodeURIComponent(path+url.search),302));throw e;}
    if(path.startsWith('/society/materials/')){
     const file=await session.db.get('materials',path.slice('/society/materials/'.length));need(file,404,'Document not found.');
     return secure(new Response(Uint8Array.from(atob(file.content),c=>c.charCodeAt(0)),{headers:{'Content-Type':file.content_type}}));
    }
   }else need(['/signin.html','/access.js','/access.css','/sw.js','/health'].includes(path),404,'Not found.');
   if(path==='/health')return secure(json({service:'community-directory',configured}));
   need(['GET','HEAD'].includes(request.method),405,'Method not allowed.');return secure(await env.ASSETS.fetch(request));
  }catch(e){return secure(json({error:e.status?e.message:'The request could not be completed. Please retry.'},e.status||500));}
 };
}
export default {fetch:createHandler()};
