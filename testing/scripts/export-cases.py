"""Export actual leaf results; Node container outcomes are not extra test cases."""
import csv,json,xml.etree.ElementTree as ET
from pathlib import Path
base=Path(__file__).resolve().parents[1]
rows=[]
for case in ET.parse(base/'evidence/backend.junit.xml').iter('testcase'):
    status='FAIL' if case.find('failure') is not None else 'SKIP' if case.find('skipped') is not None else 'PASS'
    rows.append({'layer':'Backend','case':case.get('name'),'result':status,'duration_seconds':case.get('time'),'evidence':'evidence/backend.junit.xml','source':case.get('file','').split('/backend/')[-1]})
def visit(suite):
    for spec in suite.get('specs',[]):
        for test in spec.get('tests',[]):
            result=test['results'][-1]
            rows.append({'layer':'Browser','case':spec['title'],'result':result['status'].upper(),'duration_seconds':result['duration']/1000,'evidence':'evidence/browser-results.json','source':spec.get('file','')})
    for child in suite.get('suites',[]):visit(child)
for suite in json.loads((base/'evidence/browser-results.json').read_text())['suites']:visit(suite)
live=base/'evidence/live-ai-success-summary.json'
if live.exists():
    for case in json.loads(live.read_text())['cases']:
        if case['realProvider']:
            rows.append({'layer':'Live provider retest','case':case['name'],'result':case['result'],'duration_seconds':case['seconds'],'evidence':'evidence/live-ai-success-summary.json','source':'backend/test/assistant-http.test.js'})
with (base/'reports/test-case-results.csv').open('w',newline='',encoding='utf-8-sig') as out:
    writer=csv.DictWriter(out,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
summary={layer:{status:sum(r['layer']==layer and r['result']==status for r in rows) for status in sorted({r['result'] for r in rows if r['layer']==layer})} for layer in sorted({r['layer'] for r in rows})}
(base/'evidence/case-summary.json').write_text(json.dumps(summary,indent=2))
print(summary)
