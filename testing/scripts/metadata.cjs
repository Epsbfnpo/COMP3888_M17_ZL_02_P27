const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function git(args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
const files=[];
function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const name=path.posix.join(dir,entry.name);if(entry.isDirectory()){if(!['node_modules','.next','.git','.wrangler','.vinext','dist','coverage','evidence','reports','test-results','playwright-report'].includes(entry.name))walk(name);}else if(!entry.name.startsWith('.env')&&/\.(js|cjs|ts|tsx|css|sql|json|md)$/.test(entry.name))files.push(name);}}
for(const dir of ['backend','frontend','testing'])walk(dir);
const hashes=Object.fromEntries(files.sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const result={recorded:new Date().toISOString(),timezone:'Australia/Sydney',gitHead:git(['rev-parse','HEAD']),gitStatus:git(['status','--short']),node:process.version,platform:process.platform,arch:process.arch,tools:{c8:require('c8/package.json').version,playwright:require('@playwright/test/package.json').version,axe:JSON.parse(fs.readFileSync(path.join(root,'testing/node_modules/@axe-core/playwright/package.json'),'utf8')).version},hashes,exclusions:['.env and credentials','dependencies','generated output','reports and evidence (hashed in artifact manifest separately)']};
result.applicationVersions={};
for(const [dir,names] of [['backend',['express','mysql2']],['frontend',['react','vite','vinext']]])for(const name of names)result.applicationVersions[name]=JSON.parse(fs.readFileSync(path.join(root,dir,'node_modules',name,'package.json'),'utf8')).version;
fs.writeFileSync(path.join(root,'testing/evidence/run-metadata.json'),JSON.stringify(result,null,2));console.log('Recorded',files.length,'non-secret source/configuration hashes.');
