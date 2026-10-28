# Live Gemini Verification — Successful Retest

**Project:** P27 · COMP3888_M17_02_ZL  
**Date:** 26 October 2026 (Australia/Sydney)  
**Model:** gemini-3.8-flash  
**Outcome:** 5 passed, 0 failed, 0 skipped. Three tests used real Gemini; two used deterministic HTTP fixtures.

## Real-provider results

| Scenario | Result | Test duration | What was verified |
|---|---|---|---|
| General conversation | PASS | 2.10 s | Answers a synthetic port question through the actual provider and HTTP router. |
| Complete body rewrite | PASS | 2.70 s | Returns a validated nonempty replacement up to 12,000 characters with server-owned original text. |
| Unsaved-draft consistency | PASS | 3.92 s | Receives the supplied draft and selected published reference; returns a usable answer. |

Durations are single test observations including HTTP/context/provider work, not a latency benchmark or SLA. Total test-run time was 8.95 seconds.

## Observed reply content

The ordinary answer states that ships may enter only during the day. In the consistency reply, the model identified midnight entry as a clear conflict with the absolute night-entry ban, cited Harbour Regulations (ID 3, version 2), suggested daylight arrival or waiting offshore, and limited its conclusion to supplied context. This is a qualitative review of one recorded synthetic response, not a repeated accuracy evaluation.

The body-edit test validates response plumbing and replacement shape/length; its log does not preserve the full replacement for independent semantic review. No broad claim about rewrite quality is made.

## Relationship to the baseline report

This successful retest supersedes the earlier blocked/failed connection status for these three smoke scenarios. The main report now integrates this successful run alongside its original deterministic baseline; historical skipped results are retained and the later real-provider passes are shown separately. Earlier API-key errors, timeouts and service-error evidence are retained. No cause for the difference between keys/accounts is inferred.

The broader five-scenario, repeated AI quality assessment and client acceptance remain outstanding. The registration-email defect and contrast finding from the baseline are unchanged.

## Evidence and reproduction

Evidence: `live-ai-latest.tap`, `live-ai-latest.junit.xml` and `live-ai-success-summary.json` in `testing/evidence/`. Only synthetic content was sent; no application data or business code was modified and no key value is recorded.

From `backend/`, with the local key configured:

```sh
AI_LIVE_SMOKE=1 AI_LIVE_EDIT_SMOKE=1 node --test test/assistant-http.test.js
```
