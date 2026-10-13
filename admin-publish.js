/* Publish the public directory and its workbook together, without overwriting newer edits. */
(function(root,factory){
  var api=factory();if(typeof module==='object' && module.exports)module.exports=api;else root.DirectoryPublisher=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  async function publish(options){
    var request=options.fetch||fetch,base='https://api.github.com/repos/'+options.repo;
    async function api(path,method,body){
      var response=await request(base+path,{method:method||'GET',headers:{Authorization:'Bearer '+options.token,
        Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
        body:body?JSON.stringify(body):undefined});
      var json=await response.json();if(!response.ok)throw Error(json.message||'GitHub returned '+response.status);return json;
    }
    var ref=await api('/git/ref/heads/main'),parent=ref.object.sha;
    var current=await api('/contents/services.json?ref='+encodeURIComponent(parent));
    var raw=atob(current.content.replace(/\s/g,'')),bytes=Uint8Array.from(raw,function(char){return char.charCodeAt(0);});
    if(JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)))!==JSON.stringify(options.baseline))
      throw Error('The directory changed on GitHub since you opened it. Download your draft as Excel, reload, and import it before publishing again.');
    var commit=await api('/git/commits/'+parent);
    var blobs=await Promise.all(options.files.map(async function(file){
      var blob=await api('/git/blobs','POST',{content:file.content,encoding:'base64'});
      return {path:file.path,mode:'100644',type:'blob',sha:blob.sha};
    }));
    var tree=await api('/git/trees','POST',{base_tree:commit.tree.sha,tree:blobs});
    var next=await api('/git/commits','POST',{message:'Update town contacts and spreadsheet',tree:tree.sha,parents:[parent]});
    var latest=await api('/git/ref/heads/main');
    if(latest.object.sha!==parent)throw Error('Someone published another update. Your draft is still here; reload and import your saved draft before retrying.');
    await api('/git/refs/heads/main','PATCH',{sha:next.sha,force:false});
    return next.sha;
  }
  return {publish:publish};
});
