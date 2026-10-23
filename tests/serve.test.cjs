const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {startPreview}=require('../serve.cjs');
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
test('reuses this directory preview for the site and contact editor',async()=>{
  const first=await startPreview({port:0});
  try{
    const port=first.server.address().port;
    const second=await startPreview({port});
    assert.equal(second.reused,true);assert.equal(second.server,null);assert.equal(second.url,first.url);
    const editor=await startPreview({port,admin:true});
    assert.equal(editor.url,first.url+'admin.html');assert.equal(editor.reused,true);
  }finally{await close(first.server);}
});
test('chooses a free port without disturbing a different program',async()=>{
  const other=http.createServer((req,res)=>res.end('Different local project'));
  await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));
  let preview;
  try{
    const port=other.address().port;preview=await startPreview({port});
    assert.equal(preview.reused,false);assert.notEqual(preview.server.address().port,port);
    assert.equal(await (await fetch('http://127.0.0.1:'+port)).text(),'Different local project');
    assert.match(await (await fetch(preview.url)).text(),/id="contactsPanel"/);
  }finally{if(preview?.server)await close(preview.server);await close(other);}
});
