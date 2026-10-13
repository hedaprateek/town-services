// Read-only local preview; the published website needs no Node.js server.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const allowed=new Set(['index.html','directory-core.js','services.json','sw.js','manifest.webmanifest',
  'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
http.createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  let file;try{file=decodeURIComponent(new URL(request.url,'http://localhost').pathname).slice(1)||'index.html';}
  catch{response.writeHead(400).end();return;}
  if(!allowed.has(file)){response.writeHead(404).end();return;}
  fs.readFile(path.join(__dirname,file),(error,bytes)=>{
    if(error){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});
    response.end(request.method==='HEAD'?undefined:bytes);
  });
}).listen(8799,'127.0.0.1',()=>{
  console.log('Local Services preview: http://localhost:8799/ — press Ctrl+C to stop.');
  if(process.argv.includes('--open') && process.platform==='win32')require('node:child_process').spawn('powershell.exe',
    ['-NoProfile','-Command',"Start-Process 'http://localhost:8799/'"],{windowsHide:true,stdio:'ignore'});
});
