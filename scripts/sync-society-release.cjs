/* Release the reviewed shared app to the separate society Git checkout. No runtime data is copied. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const source=path.resolve(__dirname,'..'),destination=path.resolve(process.argv[2]||path.join(source,'..','society-directory'));
const remote=cp.execFileSync('git',['remote','get-url','origin'],{cwd:destination,encoding:'utf8',windowsHide:true}).trim();
if(!/^https:\/\/github\.com\/hedaprateek\/People-Information(?:\.git)?$/.test(remote))throw Error('Destination must be the existing People-Information checkout.');
const out=path.join(destination,'.community');
if(fs.existsSync(out)&&fs.realpathSync(out)!==path.join(fs.realpathSync(destination),'.community'))throw Error('Release destination must not be a symlink.');
const files=new Map();
function collect(rel){const full=path.join(source,rel);if(fs.statSync(full).isDirectory()){for(const entry of fs.readdirSync(full))collect(rel+'/'+entry);}else files.set(rel,fs.readFileSync(full));}
for(const rel of ['access','index.html','admin.html','directory-core.js','icons','manifest.webmanifest','firestore.rules','firestore.indexes.json','scripts/build-private.cjs','scripts/browser-private.mjs','scripts/check-deployment.mjs',
 'tests/access.test.mjs','tests/firestore-client.test.mjs','tests/firestore-rules.test.mjs','tests/private-build.test.cjs','tests/memory-store.mjs'])collect(rel);
for(const rel of ['index.html','admin.html','manifest.webmanifest','LICENSE'])collect('society/'+rel);
for(const dir of ['icons','template','forms'])collect('society/'+dir);
for(const rel of files.keys())if(/(?:^|\/)(?:materials|private-data|node_modules|dist)(?:\/|$)|(?:^|\/)(?:services\.json|directory\.json|data\.xlsx|services\.xlsx|\.env.*|\.dev.vars)$/.test(rel))throw Error('Runtime data cannot enter the release: '+rel);
// Remove only a verified, generated release directory, never the repository or its live source data.
if(path.dirname(out)!==destination||path.basename(out)!=='.community')throw Error('Unsafe release path.');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const [rel,bytes]of files){const full=path.join(out,rel);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes);}
const manifest={source:'hedaprateek/town-services',branch:'google-access',files:Object.fromEntries([...files].map(([rel,bytes])=>[rel,crypto.createHash('sha256').update(bytes).digest('hex')]))};
fs.writeFileSync(path.join(out,'RELEASE.json'),JSON.stringify(manifest,null,2)+'\n');
const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
pkg.scripts={build:'node .community/scripts/build-private.cjs',test:'node --test .community/tests/*.test.cjs .community/tests/*.test.mjs',dev:'wrangler dev',deploy:'wrangler deploy','test:browser':'node .community/scripts/browser-private.mjs','check:deployment':'node .community/scripts/check-deployment.mjs','firebase:rules':'firebase deploy --only firestore','test:rules':'firebase emulators:exec --project demo-community-directory --only firestore "node --test .community/tests/firestore-rules.test.mjs"'};
fs.writeFileSync(path.join(destination,'package.json'),JSON.stringify(pkg,null,2)+'\n');
for(const rel of ['package-lock.json','.node-version','.firebaserc'])fs.copyFileSync(path.join(source,rel),path.join(destination,rel));
const config=JSON.parse(fs.readFileSync(path.join(source,'wrangler.jsonc'),'utf8'));
config.name='society-info';config.main='.community/access/worker.mjs';config.assets.directory='./.community/dist';config.vars.DEFAULT_DIRECTORY='society';
fs.writeFileSync(path.join(destination,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
const firebase=JSON.parse(fs.readFileSync(path.join(source,'firebase.json'),'utf8'));
firebase.firestore.rules='.community/firestore.rules';firebase.firestore.indexes='.community/firestore.indexes.json';
fs.writeFileSync(path.join(destination,'firebase.json'),JSON.stringify(firebase,null,2)+'\n');
fs.copyFileSync(path.join(source,'CLOUDFLARE-GITHUB.md'),path.join(destination,'CLOUDFLARE-GITHUB.md'));
console.log('Released '+files.size+' application source/assets to society-directory/.community. No live contacts, workbooks, PDFs or migration files were copied.');
