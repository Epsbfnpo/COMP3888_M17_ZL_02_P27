# Tests and verification evidence

This directory contains browser tests, the backend coverage runner, test plans
and dated reports. Follow the [root setup and testing guide](../README.md#tests-and-reports)
for dependencies, test-database permissions and execution commands.

## Test layers

- `../backend/test/`: Node unit, boundary and API/integration tests.
- `e2e/workflows.spec.cjs`: browser account, collaboration, history and AI workflows.
- `e2e/observations.spec.cjs`: a small local read workload.
- `e2e/supplementary.spec.cjs`: UI restore, role-dependent controls, AI panel safety and a ten-page accessibility scan.
- `scripts/ai-evaluation.cjs`: opt-in, paid repeated evaluation of real Gemini replies.
- `test-plan/TEST_PLAN.md`: acceptance themes, techniques and planned quality evaluation.

The database-backed suites create isolated temporary schemas. The browser runner
starts the application on ports 3390/3391 using synthetic accounts and content.
Named AI browser cases use controlled replies. Actual Gemini calls require a
separate opt-in run and a backend key.

## Generated output

| Location | Contents |
|---|---|
| `coverage/index.html` | Backend file/line coverage |
| `playwright-report/index.html` | Browser results and attachments |
| `evidence/backend.junit.xml` | Backend leaf-case results |
| `evidence/browser-results.json` | Browser execution results |
| `evidence/frontend-checks.json` | Frontend unit, lint, type and build outcomes |
| `evidence/database-cleanup-verification.json` | Check for remaining temporary schemas |

Run `node scripts/verify-cleanup.cjs` after testing. If execution was interrupted,
inspect the exact fixture schema before cleaning it up. Never point test writes
at the application database.

Raw logs, screenshots, traces, local environment metadata and synthetic session
fixtures remain ignored. Inspect them before preparing an evidence package.
Do not force-add environment files or session fixtures to Git.

## Historical reports

- [26 October test report](reports/Worldbuilding_Test_Report_20261026.pdf)
- [Editable report source](reports/Worldbuilding_Test_Report_20261026.md)
- [Separate real-provider retest](reports/Live_AI_Successful_Retest_20261026.pdf)
- [31 October supplementary tests](reports/supplementary-20261031/README.md): permission matrix, AI safety and quality evaluation, accessibility scan and contrast fix
- [Recorded case results](reports/test-case-results.csv)

These files and the portable summaries in `evidence/` describe the recorded
26 October baseline. That baseline included the registration-validation and
login-label contrast findings, both subsequently fixed and retested. Preserve
the dated evidence rather than replacing its results with later outcomes.

The dated report renderer and export scripts contain historical narrative and
retest inputs. Running tests refreshes local machine output, but does not make
the old report narrative current. Review source version, dates, counts, findings
and linked evidence together when preparing a new report.

Passing smoke tests establish the exercised integration. Repeated AI quality
evaluation, broad accessibility testing and hosted acceptance require additional
evidence. Backend code coverage is not a complete requirements-coverage metric.
