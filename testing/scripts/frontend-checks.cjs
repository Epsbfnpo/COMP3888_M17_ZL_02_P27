const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const commands=[['frontend-tests',process.execPath,['--test','app/edit-suggestion.test.ts']],['lint','npm',['run','lint']],['typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']],['build','npm',['run','build']]];
const results=[];
for(const [name,cmd,args] of commands){const started=new Date().toISOString();const r=cp.spawnSync(cmd,args,{cwd:path.join(root,'frontend'),encoding:'utf8',shell:process.platform==='win32'&&cmd==='npm'});fs.writeFileSync(path.join(root,'testing/evidence',name+'.log'),(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''));results.push({name,command:[cmd,...args],started,finished:new Date().toISOString(),exitCode:r.status??1});fs.writeFileSync(path.join(root,'testing/evidence/frontend-checks.json'),JSON.stringify(results,null,2));console.log(name,r.status??1);}
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
