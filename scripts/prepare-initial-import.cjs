const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),society=path.resolve(process.argv[2]||path.join(root,'..','society-directory'));
const documents=[
 {scope:'town',data:JSON.parse(fs.readFileSync(path.join(root,'services.json'),'utf8')),workbook:fs.readFileSync(path.join(root,'services.xlsx')).toString('base64')},
 {scope:'society',data:JSON.parse(fs.readFileSync(path.join(society,'directory.json'),'utf8')),workbook:fs.readFileSync(path.join(society,'data.xlsx')).toString('base64')}
];
const materials=fs.readdirSync(path.join(society,'materials')).filter(n=>fs.statSync(path.join(society,'materials',n)).isFile()).map(name=>({name,content:fs.readFileSync(path.join(society,'materials',name)).toString('base64')}));
const dir=path.join(root,'private-data');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'initial-import.json'),JSON.stringify({version:3,documents,materials}));
console.log('Prepared private-data/initial-import.json for the owner’s initial import. It is ignored by Git and excluded from deployment.');
