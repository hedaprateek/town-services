/* Explicit asset staging: source files, resident data and credentials are never web assets. */
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'dist');
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n'); }
function write(file, data) { const target = path.join(OUT, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); }
function copy(from, to) { const file = path.join(ROOT, from); if (!fs.existsSync(file)) throw Error('Missing required asset: ' + from); write(to, fs.readFileSync(file)); }
function replace(source, pattern, replacement, label) { if (!pattern.test(source)) throw Error('Cannot find integration point: ' + label); return source.replace(pattern, replacement); }
function common(html) {
  return html.replace('<html lang="en"', '<html class="auth-loading" lang="en"')
    .replace('</head>', '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/access.css"><style>body{padding-bottom:90px}.stunity-credit{margin-bottom:34px}</style><script src="/access.js"></script></head>')
    .replace(/ data-print-only/g, '')
    .replace(/<script src="https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.3\/package\/dist\/xlsx.full.min.js"><\/script>/g, '<script src="/admin/xlsx.full.min.js"></script>');
}
// Verify the absolute generated folder before removing stale outputs (including prior private builds).
const realRoot=fs.realpathSync(ROOT);
if(path.dirname(OUT)!==ROOT||path.basename(OUT)!=='dist'||fs.existsSync(OUT)&&fs.realpathSync(OUT)!==path.join(realRoot,'dist'))throw Error('Unsafe build output path');
fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT, { recursive: true });
let town = common(read('index.html'));
town = replace(town, /  if\(location.hostname === "appassets.androidplatform.net"\)[\s\S]*?  fetch\("services.json\?v=" \+ Date.now\(\)\)/,
  '  DirectoryAccess.ensure("town").then(function(){return DirectoryAccess.api("/api/directory/town");})', 'town data fetch');
town = replace(town, /  function updateConnection\(\)\{[\s\S]*?\n  \}/,
  '  function updateConnection(){ var e=document.getElementById("offlineState"); if(e)e.textContent="Approved viewers · Internet required"; }', 'town connection footer');
write('town/index.html', town);
copy('directory-core.js', 'town/directory-core.js');
for (const file of fs.readdirSync(path.join(ROOT, 'icons'))) if (/\.(png|svg)$/.test(file)) copy('icons/' + file, 'town/icons/' + file);
copy('manifest.webmanifest', 'town/manifest.webmanifest');
let editor = common(read('admin.html'));
editor = replace(editor, /    <p class="hint">\n      Needs a GitHub[\s\S]*?    <div id="checkOut"><\/div>/,
  '<p class="hint">Publish saves this draft to the protected directory. Your administrator Google login authorizes the change.</p><div class="btns"><button id="pubBtn">Publish</button><a href="/admin/">Manage access</a></div>', 'town publishing form');
editor = replace(editor, /  \/\* ---------- publish ---------- \*\/[\s\S]*?(?=  \$\("pubBtn"\).addEventListener)/,
  '  var revision=0;\n  function b64(buf){var out="",a=new Uint8Array(buf);for(var i=0;i<a.length;i++)out+=String.fromCharCode(a[i]);return btoa(out);}\n', 'town publishing credentials');
editor = replace(editor, /    fetch\(DATA \+ "\?v=" \+ Date.now\(\)\)\n      \.then\(function \(r\) \{[^\n]+\}\)/,
  '    DirectoryAccess.ensure("town",true).then(function(){return DirectoryAccess.get("/api/admin/directory/town");}).then(function(d){revision=d.revision;return d.data || {title:"Local Services & Help",rows:[],columns:COLS,sponsors:[]};})', 'town editor data');
editor = editor.replace(/    var c = creds\(\);\n    if \(!c\) return;\n/g, '');
editor = replace(editor, /if\(!confirm\(changedSummary\(\)\+'\\n\\nPublish this draft to '\+c.repo\+'\?'\)\)return;/,
  'if(!confirm(changedSummary()+"\\n\\nPublish this draft to the protected town directory?"))return;', 'town publish review');
editor = replace(editor, /    DirectoryPublisher.publish\([\s\S]*?\n      \.then\(function \(\) \{/,
  '    DirectoryAccess.get("/api/admin/directory/town",{method:"PUT",body:{data:out,revision:revision,workbook:b64(bytes)}})\n      .then(function (result) { revision=result.revision;', 'town backend publish');
editor = editor.replace('Published. The live page updates within a minute — reload it to check.', 'Published. Approved viewers see the update when they reload.');
editor = editor.replace('<script src="admin-publish.js"></script>', '');
write('town/admin.html', editor);

let society = common(read('society/index.html'));
society = replace(society, /  function offlineReady\(\) \{[\s\S]*?\n  offlineReady\(\);/, '  // Approved viewing requires an online permission check.', 'society offline registration');
society = replace(society, /  fetch\(DATA_FILE \+ "\?v=" \+ Date.now\(\)\)/,
  '  DirectoryAccess.ensure("society").then(function(){return DirectoryAccess.api("/api/directory/society");})', 'society directory fetch');
society = society.replace(/"https:\/\/view.officeapps.live.com\/op\/view.aspx\?src=" \+ encodeURIComponent\(absUrl\(file\)\)/g, 'absUrl(file)');
write('society/index.html', society);
for (const dir of ['icons', 'template', 'forms']) {
  for (const file of fs.readdirSync(path.join(ROOT, 'society', dir))) {
    if (!fs.statSync(path.join(ROOT, 'society', dir, file)).isFile()) continue;
    copy('society/' + dir + '/' + file, 'society/' + dir + '/' + file);
  }
}
copy('society/manifest.webmanifest', 'society/manifest.webmanifest');

// Retain the original society parser, including hidden sheets/columns/cells and notice order.
const grab = re => { const m = read('society/index.html').match(re); if (!m) throw Error('Society workbook parser changed: ' + re); return m[0]; };
const parser = [
  'var sections=[],meta={},sectionNotes={},sectionHindi={},sectionGroup={},dataAsOf=null,dataOffline=false,lang="en",sheetOpen=false;',
  'function afterData(){}',
  ...[/function key\(s\)[^\n]*\n/, /function slug\(s\)[^\n]*\n/,
    /function fileCol\(cols\)[\s\S]*?\n    return null;\n  \}/, /function classify\(cols\)[\s\S]*?\n    return r;\n  \}/,
    /function isNotice\(name\)[^\n]*\n/, /function noticeMap\(cols\)[\s\S]*?\n  \}/,
    /function noticeOrder\(rows, map\)[\s\S]*?\n  \}/, /function parseDate\([^)]*\)[\s\S]*?\n  \}/,
    /function isPinned\([^)]*\)[\s\S]*?\n  \}/, /function normKey\(k\)[^\n]*\n/, /function isHidden\(v\)[^\n]*\n/,
    /var HIDE_COL = [^\n]*\n/, /var HIDE_YES = [^\n]*\n/, /function rowHidden\(r\)[\s\S]*?\n  \}/,
    /function shown\(r\)[\s\S]*?\n  \}/, /function hasAnything\(r\)[\s\S]*?\n  \}/, /function parse\(buf\)[\s\S]*?\n  \}/].map(grab),
  'return {built:new Date().toISOString().slice(0,10),meta:meta,sections:sections,notes:sectionNotes,hindi:sectionHindi,group:sectionGroup};'
];
// Direct function code (not eval) is used by the browser editor.
write('society/workbook-parser.js', 'window.SocietyWorkbook={parse:function(bytes){\n' + parser.slice(0, -1).join('\n') + '\nparse(bytes);\n' + parser.at(-1) + '\n}};');
let se = common(read('society/admin.html'));
se = se.replace('<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>', '<script src="workbook-parser.js"></script>');
se = se.replace('  var DATA_FILE = "data.xlsx";', '  var DATA_FILE = "data.xlsx", revision=0;');
se = replace(se, /    fetch\(DATA_FILE \+ "\?v=" \+ Date.now\(\)\)\n      \.then\(function \(r\) \{[^\n]+\}\)/,
  '    DirectoryAccess.ensure("society",true).then(function(){return DirectoryAccess.get("/api/admin/directory/society");}).then(function(d){revision=d.revision;if(d.workbook)return Uint8Array.from(atob(d.workbook),function(c){return c.charCodeAt(0);}).buffer;return XLSX.write(XLSX.utils.book_append_sheet(XLSX.utils.book_new(),XLSX.utils.aoa_to_sheet([["Field","Value"],["Society Name","Our Society"]]),"About",true),{type:"array",bookType:"xlsx"});})', 'society workbook load');
// Replace the empty-workbook expression with an explicit helper to avoid book_append_sheet's return-value differences.
se = se.replace('return XLSX.write(XLSX.utils.book_append_sheet(XLSX.utils.book_new(),XLSX.utils.aoa_to_sheet([["Field","Value"],["Society Name","Our Society"]]),"About",true),{type:"array",bookType:"xlsx"});', 'var w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([["Field","Value"],["Society Name","Our Society"]]),"About");return XLSX.write(w,{type:"array",bookType:"xlsx"});');
se = replace(se, /  function creds\(\) \{[\s\S]*?\n  \}/, '  function creds(){return {};}', 'society credentials');
se = replace(se, /  function putFile\(c, path, contentB64, message\) \{[\s\S]*?\n  \}/,
  '  function putFile(c,path,contentB64){if(!/^materials\\//.test(path))return Promise.reject(Error("Use Publish to save the directory."));return DirectoryAccess.get("/api/admin/material?name="+encodeURIComponent(path.slice(10)),{method:"PUT",body:{content:contentB64}});}', 'society document uploads');
se = replace(se, /  \/\* ---------- token diagnostics ---------- \*\/[\s\S]*?(?=  \/\* ---------- upload a material ---------- \*\/)/, '', 'society token diagnostics');
se = replace(se, /  \$\("pubBtn"\).onclick = function \(\) \{[\s\S]*?\n  \};/, `  $("pubBtn").onclick = async function () {
    if(!confirm("Publish the reviewed society directory?"))return;
    var locked=Array.from(document.querySelectorAll('input,select,textarea,button')).filter(function(e){return !e.disabled;});
    locked.forEach(function(e){e.disabled=true;});
    try {
      var bytes=XLSX.write(toWorkbook(),{type:"array",bookType:"xlsx"});
      var out=SocietyWorkbook.parse(bytes);
      var result=await DirectoryAccess.get('/api/admin/directory/society',{method:'PUT',body:{revision:revision,data:out,workbook:b64(bytes)}});
      revision=result.revision;dirty=false;say("Published. Approved viewers see the update when they reload.");
    }catch(e){say(e.message,"err");}finally{locked.forEach(function(e){e.disabled=false;});}
  };`, 'society protected publish');
se = se.replace('20 * 1024 * 1024', '750000').replace('The GitHub contents API caps at about 25 MB — keep it under 20.', 'Keep uploaded documents under 750 KB on this free setup.');
se = se.replace('It is committed straight away,', 'It is uploaded to protected storage straight away,').replace('Needs the GitHub token below.', 'Uses your administrator login.');
// Legacy code/token widgets remain inert hidden DOM for compatibility with the retained editor helpers.
se = se.replace(/<div class="card">\n    <h2>(Member codes[^<]*|Publishing)<\/h2>/g, '<div class="card" hidden>\n    <h2>$1</h2>');
se = se.replace(/<div class="card">\n    <h2>Public services page<\/h2>/, '<div class="card" hidden>\n    <h2>Public services page</h2>');
se = se.replace('  mcRestore();', '  // Legacy member-code storage is no longer used.');
se = se.replace('Loaded " + DATA_FILE + " from the live site', 'Loaded workbook from the protected directory');
write('society/admin.html', se);
for (const file of ['signin.html', 'access.js', 'access.css', 'sw.js']) copy('access/public/' + file, file);
copy('access/public/admin.html', 'admin/index.html');
const xlsx = path.join(ROOT, 'access', 'vendor', 'xlsx.full.min.js');
if (!fs.existsSync(xlsx)) throw Error('Missing pinned spreadsheet library.');
write('admin/xlsx.full.min.js', fs.readFileSync(xlsx));
// In-place worker retirement files for all previous service worker scopes.
for (const dir of ['town', 'society']) copy('access/public/sw.js', dir + '/sw.js');
const prohibited = /(^|\/)(services\.json|directory\.json|data\.xlsx|services\.xlsx|\.env.*|\.dev.vars|wrangler.*|.*\.sql)$/i;
const allow = new Set(['town', 'society', 'admin', 'signin.html', 'access.js', 'access.css', 'sw.js']);
function inspect(dir) { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const full=path.join(dir,f.name),rel=path.relative(OUT,full).replaceAll('\\','/');if(prohibited.test(rel)||!allow.has(rel.split('/')[0]))throw Error('Refusing unexpected build asset: '+rel);if(f.isDirectory())inspect(full); } }
inspect(OUT);
console.log('Built Firebase-backed directories and administration. No live contact data or working spreadsheets are deployed as static assets.');
