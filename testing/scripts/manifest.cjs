const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..'),files={};
function walk(dir){if(!fs.existsSync(path.join(base,dir)))return;for(const e of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){const file=path.posix.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.name!=='artifact-manifest.json'&&e.name!=='browser-fixture.json')files[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(base,file))).digest('hex');}}
for(const dir of ['evidence','reports','coverage','test-results','playwright-report'])walk(dir);
fs.writeFileSync(path.join(base,'evidence/artifact-manifest.json'),JSON.stringify({generated:new Date().toISOString(),algorithm:'SHA-256',files},null,2));
console.log('Hashed',Object.keys(files).length,'artifacts.');
