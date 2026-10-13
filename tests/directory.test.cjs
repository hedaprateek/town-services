const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../directory-core.js');
const root=path.resolve(__dirname,'..');
const row={Name:'Rahul Shelar',Role:'Plumber',Category:'Repairs & Maintenance',Phone:'9673020210',Covers:'Shahapur'};
const hay=core.index(row,row.Role);
test('finds services in English, Hindi, Marathi and transliteration',()=>{
  for(const query of ['plumber','PlUmBeR','plumbing','leaking tap','नल','नळ','nal','प्लंबर'])assert.ok(core.matches(hay,query),query);
  assert.ok(core.matches(hay,'leaking tap Rahul'));
  assert.ok(!core.matches(hay,'leaking tap another name'));
  assert.ok(!core.matches(hay,'electrician'));
});
test('matches names, areas, categories and numbers without changing records',()=>{
  const before=JSON.stringify(row);
  for(const query of ['rahul shelar','Shahapur','9673020210','दुरुस्ती व देखभाल','मरम्मत और रखरखाव'])assert.ok(core.matches(hay,query),query);
  assert.equal(JSON.stringify(row),before);
  assert.ok(core.matches(core.index({Name:'Kunal',Role:'Carpenter'},'Carpenter'),'nal'));
  assert.ok(core.matches(core.index({Name:'Contact',Phone:'+91 96730 20210'},''),'919673020210'));
});
test('localizes known services and categories while retaining custom names',()=>{
  assert.equal(core.label('Cook','mr'),'स्वयंपाकी');assert.equal(core.label('Carpenter','hi'),'बढ़ई');
  assert.equal(core.category('Home Help','mr'),'घरकाम मदत');assert.equal(core.label('Custom service','hi'),'Custom service');
  assert.ok(core.rank('Plumber')<core.rank('Accountant'));
});
test('call numbers reject placeholders while preserving international and utility numbers',()=>{
  assert.equal(core.phone('--'),'');assert.equal(core.phone('Not provided'),'');assert.equal(core.phone('1'),'');
  assert.equal(core.phone('96730 20210'),'9673020210');assert.equal(core.phone('+1 (415) 555-1234'),'+14155551234');
  assert.equal(core.phone('1912'),'1912');assert.equal(core.phone('javascript:1234567'),'');
});
test('saved identity survives contact corrections and separates different services',()=>{
  const contact={name:' Rahul Shelar ',role:'Plumber',category:'Repairs & Maintenance',phone:'9673020210'};
  assert.equal(core.contactId(contact),core.contactId({...contact,name:'RAHUL SHELAR',phone:'9309564191',notes:'Corrected'}));
  assert.notEqual(core.contactId(contact),core.contactId({...contact,role:'Electrician'}));
  assert.notEqual(core.contactId({...contact,id:'a'}),core.contactId({...contact,id:'b'}));
});
test('phone contact downloads escape user text, fold Unicode safely and retain caution',()=>{
  const note='Check credentials; agree charges, first.\n'+'मराठी 😀 '.repeat(40);
  const card=core.vcard({name:'प्रतीक, Heda; Test',phone:'+91 96730 20210',role:'Plumber',
    notes:note,url:'https://example.test/town-services/#contact=abc'});
  const unfolded=card.replace(/\r\n /g,'');
  assert.ok(unfolded.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  assert.ok(unfolded.includes('FN:प्रतीक\\, Heda\\; Test\r\n'));
  assert.ok(unfolded.includes('TEL;TYPE=VOICE:+919673020210\r\n'));
  assert.ok(unfolded.includes('NOTE:Check credentials\\; agree charges\\, first.\\n'));
  assert.ok(unfolded.endsWith('END:VCARD\r\n'));
  for(const line of card.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
  assert.ok(!card.includes('\ufffd'));
  assert.ok(!core.vcard({name:'Person\nTEL:123',phone:'Not provided'}).includes('\r\nTEL:'));
});
test('HTML scripts parse and the Android staging allowlist includes search without admin data',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/src=|application\/ld\+json/.test(script[1]))continue;new vm.Script(script[2]);
  }
  assert.ok(html.includes('src="directory-core.js"'));
  const stage=fs.readFileSync(path.join(root,'android/stage-site.js'),'utf8');
  const files=stage.match(/const FILES = \[([\s\S]*?)\];/)[1];
  assert.ok(files.includes('directory-core.js'));assert.ok(!files.includes('admin.html'));assert.ok(!files.includes('services.xlsx'));
});
