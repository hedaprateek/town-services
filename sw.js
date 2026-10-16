/* Own caches only: other projects retain their offline copies. */
var BASE = new URL('./', self.location.href);
var PREFIX = 'town-services:' + BASE.pathname + ':';
var SHELL = PREFIX + 'shell-v6';
var DATA = PREFIX + 'data-v6';
var PAGE = new URL('index.html', BASE).href;
var LIST = new URL('services.json', BASE).href;
var FILES = ['./','index.html','directory-core.js','manifest.webmanifest',
  'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
var PUBLIC = new Set(FILES.map(function(path){return new URL(path,BASE).href;}));
function isFont(url){return url.hostname==='fonts.googleapis.com' || url.hostname==='fonts.gstatic.com';}
async function network(request){
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},4000);
  try{return await fetch(request,{signal:controller.signal});}finally{clearTimeout(timer);}
}
async function validList(response){
  if(!response || !response.ok)return false;
  try{var data=await response.clone().json();return !!data && Array.isArray(data.rows) && typeof data.title==='string';}
  catch(error){return false;}
}
self.addEventListener('install',function(event){
  event.waitUntil((async function(){
    await (await caches.open(SHELL)).addAll(FILES.map(function(path){return new URL(path,BASE).href;}));
    var response=await network(new Request(LIST,{cache:'reload'}));
    if(!await validList(response))throw Error('Directory could not be saved for offline use');
    await (await caches.open(DATA)).put(LIST,response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',function(event){
  event.waitUntil((async function(){
    for(var key of await caches.keys()){
      if(key.indexOf(PREFIX)===0 && key!==SHELL && key!==DATA)await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
async function directory(request){
  var cache=await caches.open(DATA);
  try{
    var response=await network(request);
    if(await validList(response)){await cache.put(LIST,response.clone());return response;}
  }catch(error){/* use the last complete directory */}
  var hit=await cache.match(LIST);
  if(!hit)return new Response('',{status:503});
  var headers=new Headers(hit.headers);headers.set('X-Offline-Copy','1');
  return new Response(await hit.blob(),{status:200,headers:headers});
}
async function publicFile(request,url){
  var cache=await caches.open(SHELL),key=url.pathname===BASE.pathname?PAGE:url.origin+url.pathname;
  try{
    var response=await network(request);
    if(response.ok){await cache.put(key,response.clone());return response;}
  }catch(error){/* use saved public files */}
  return await cache.match(key) || new Response('Open this directory once with internet before using it offline.',
    {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
self.addEventListener('fetch',function(event){
  if(event.request.method!=='GET')return;
  var url=new URL(event.request.url);
  if(url.origin===BASE.origin){
    if(url.pathname===new URL(LIST).pathname)event.respondWith(directory(event.request));
    else if(url.pathname===BASE.pathname || PUBLIC.has(url.origin+url.pathname))event.respondWith(publicFile(event.request,url));
    // Admin pages, spreadsheets and other sites are outside the offline shell.
  }else if(isFont(url)){
    event.respondWith((async function(){
      var cache=await caches.open(SHELL),hit=await cache.match(event.request);
      if(hit)return hit;
      var response=await network(event.request);
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    })());
  }
});
