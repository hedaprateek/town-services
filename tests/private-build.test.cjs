const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('private build produces valid pages, no live contacts or workbooks, and uses authenticated publishing',()=>{
 cp.execFileSync(process.execPath,['scripts/build-private.cjs'],{cwd:root});
 for(const file of ['signin.html','admin/index.html','town/index.html','town/admin.html','society/index.html','society/admin.html']){
  const html=fs.readFileSync(path.join(root,'dist',file),'utf8');let n=0;
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){if(m[1].trim())new vm.Script(m[1],{filename:file+' script '+(++n)});}
  assert.match(html,/stunity-credit/);assert.match(html,/access\.js/);
  if(file.endsWith('admin.html')){assert.match(html,/api\/admin\/directory/);assert.ok(!/fetch\("https:\/\/api.github.com/.test(html));}
  if(file.endsWith('index.html')&&!file.startsWith('admin')){assert.ok(!html.includes('serviceWorker.register('));assert.match(html,/api\/directory\//);}
 }
 for(const file of ['town/services.json','town/services.xlsx','society/data.xlsx','society/directory.json','society/services.json'])assert.ok(!fs.existsSync(path.join(root,'dist',file)),file+' is not a deploy asset');
 new vm.Script(fs.readFileSync(path.join(root,'dist/society/workbook-parser.js'),'utf8'));
});
test('society spreadsheet parser preserves layout and excludes private rows, sheets and fields',()=>{
 const XLSX=require('../access/vendor/xlsx.full.min.js'),context={XLSX,window:{},console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'dist/society/workbook-parser.js'),'utf8'),context);
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Field','Value'],['Society Name','Test society']]),'About');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Name:'Visible',Phone:'123',_Secret:'hidden',Notes:'_hidden'},{Name:'Hidden',Hide:'Yes'}]),'Residents');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Name:'Private person'}]),'_Private');
 const data=context.window.SocietyWorkbook.parse(XLSX.write(wb,{type:'array',bookType:'xlsx'}));
 assert.equal(data.meta.name,'Test society');assert.equal(data.sections.length,1);assert.equal(data.sections[0].rows.length,1);
 assert.equal(data.sections[0].rows[0].Name,'Visible');assert.ok(!JSON.stringify(data).includes('Secret'));assert.ok(!JSON.stringify(data).includes('Private person'));assert.ok(!JSON.stringify(data).includes('_hidden'));
});
