/* No contact files are bundled: both Android apps open the protected website in the system browser. */
const fs=require('node:fs'),path=require('node:path');
const root=fs.realpathSync(path.join(__dirname,'..'));
const target=path.resolve(root,'android/app/src/town/assets');
if(!target.startsWith(root+path.sep)||target!==path.join(root,'android','app','src','town','assets'))throw Error('Unsafe asset folder');
if(fs.existsSync(target)&&fs.realpathSync(target)!==target)throw Error('Refusing a redirected asset folder');
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
console.log('No contact files, workbooks, tokens or admin pages are bundled in either APK.');
