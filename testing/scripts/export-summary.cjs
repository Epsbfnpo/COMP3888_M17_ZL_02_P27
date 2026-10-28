// Share portable measurements without copying raw logs, cookies or local paths.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(base,file),'utf8'));
const coverage=read('coverage/coverage-summary.json');
const browser=read('evidence/browser-results.json');
const checks=read('evidence/frontend-checks.json');
const metadata=read('evidence/run-metadata.json');
const result={
  sourceBaseline:{gitHead:metadata.gitHead,includesWorkingTreeChanges:true},
  backendLeafCases:read('evidence/case-summary.json').Backend,
  backendCoverage:{total:coverage.total,files:Object.fromEntries(Object.entries(coverage).filter(([key])=>key!=='total').map(([file,value])=>[path.basename(file),value]))},
  browser:{started:browser.stats.startTime,durationMs:browser.stats.duration,passed:browser.stats.expected,failed:browser.stats.unexpected,skipped:browser.stats.skipped,flaky:browser.stats.flaky},
  frontendChecks:checks.map(({name,started,finished,exitCode})=>({name,started,finished,exitCode})),
  realProviderRetest:read('evidence/live-ai-success-summary.json').cases.filter(c=>c.realProvider),
  limitations:['Backend deterministic baseline has one distinct failed case and three historical skipped live cases, subsequently passed in a separate real-provider retest.','Three actual-provider smoke tests passed; comprehensive repeated quality evaluation remains planned.','Raw logs, traces, screenshots and local environment metadata are generated locally and excluded from Git.']
};
fs.writeFileSync(path.join(base,'evidence/verification-summary.json'),JSON.stringify(result,null,2));
console.log('Exported portable verification summary.');
