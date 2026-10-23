// Read-only local preview; the published website needs no Node.js server.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const allowed=new Set(['index.html','admin.html','admin-publish.js','directory-core.js','services.json','sw.js','manifest.webmanifest',
  'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
function createServer(){return http.createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  let file;try{file=decodeURIComponent(new URL(request.url,'http://localhost').pathname).slice(1)||'index.html';}
  catch{response.writeHead(400).end();return;}
  if(!allowed.has(file)){response.writeHead(404).end();return;}
  fs.readFile(path.join(__dirname,file),(error,bytes)=>{
    if(error){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});
    response.end(request.method==='HEAD'?undefined:bytes);
  });
});}
function listen(server,port){return new Promise((resolve,reject)=>{
  const cleanup=()=>{server.removeListener('error',failed);server.removeListener('listening',ready);};
  const failed=error=>{cleanup();reject(error);};
  const ready=()=>{cleanup();resolve();};
  server.once('error',failed);server.once('listening',ready);server.listen(port,'127.0.0.1');
});}
async function startPreview({port=8799,admin=false}={}){
  const server=createServer();let reused=false;
  try{await listen(server,port);}catch(error){
    if(error.code!=='EADDRINUSE')throw error;
    // Reuse only a server serving this exact directory page. Leave other programs alone.
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/index.html',{signal:AbortSignal.timeout(1500),redirect:'error'});
      reused=response.ok && Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(path.join(__dirname,'index.html')));
    }catch{}
    if(!reused)await listen(server,0);
  }
  const actualPort=reused?port:server.address().port;
  return {server:reused?null:server,reused,url:'http://localhost:'+actualPort+'/'+(admin?'admin.html':'')};
}
if(require.main===module)startPreview({admin:process.argv.includes('--admin')}).then(({url,reused})=>{
  console.log((reused?'Using existing Local Services preview: ':'Local Services preview: ')+url+
    (reused?'':' — press Ctrl+C to stop.'));
  if(process.argv.includes('--open') && process.platform==='win32')require('node:child_process').spawn('powershell.exe',
    ['-NoProfile','-Command',"Start-Process '"+url+"'"],{windowsHide:true,stdio:'ignore'});
}).catch(error=>{console.error('Could not start the preview: '+error.message);process.exitCode=1;});
module.exports={startPreview};
