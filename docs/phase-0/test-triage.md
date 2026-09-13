# Phase 0 test baseline and failure classification

Fresh run: 87 suites, 1,618 tests. 82 suites / 1,603 tests passed; 5 suites / 15 tests failed. TypeScript exited 0. Exact failing test names are in `evidence/test-baseline.json`. No tests or runtime code were changed to obtain this baseline.

## Classification of all 15 failures

| Suite | Failures | Classification | Source evidence and next step |
| --- | ---: | --- | --- |
| `pullsheet-concurrency-reconciliation.integration.test.ts` | 5 | Response mock drift; production risks remain separate | R1-SEC-02, R5-IDEMP-03, R6-DISC-03, R6-DISC-08, R7-OFF-03 use successful POST mocks exposing `json()` but not `text()`. Client reads `response.text()` at service line 494, then catches the resulting error as unknown outcome. Use realistic Response-compatible mocks in Phase 1, keep assertions, and rerun to expose any further failures. This does not clear fallback/concurrency risks. |
| `repair-ticket-detail.test.tsx` | 4 | UI/requirement drift requiring semantic review | Missing `Notes (1)`, `note-item-0`, `detail-add-note-btn`, and `input-fault-description`. Current shared new/detail screen does not render these old controls. Note handlers/state still exist. Check that existing note access has not been lost; do not dismiss inaccessible functionality as a selector-only issue. |
| `new-repair-workflow.test.tsx` | 2 | UI selector/form contract drift | Missing `fault-details-card` and `input-fault-description`. `app/repair/new.tsx` delegates to the unified detail screen. Test current intended interactions after confirming web parity; do not recreate obsolete layout for tests. |
| `scan-to-repair-workflow.test.tsx` | 2 | One selector failure, one requirement conflict | Submission case cannot find `input-fault-description`; mandatory-description case calls create once when test expects zero. Current submit validates equipment/tenant but not a description; candidate web schema also does not require one. Requirement decision needed, not automatic weakening of validation or assertions. |
| `repair-hardening-concurrency.test.ts` | 2 | Confirmed swallowed failure behavior under mocks | HRD-ERR-01 and HRD-ERR-02 expect rejection but creation resolves `mock-id`. Lower helpers catch equipment/RTDB failures (`repair-service.ts:1994`, `:2028`), preventing the outer workflow from seeing them. Preserve assertions of explicit failure/partial completion. Fixing propagation alone must not induce duplicate repair creation on retry. |

Total: 5 response mock failures + 7 absent UI selector/content failures + 1 mandatory-field contract conflict + 2 swallowed failure cases = 15.

Classifications are grounded in source and failure output, not a modified-harness rerun. Updating mocks may reveal additional defects. No new pass count is claimed.

## Lint baseline

Installed ESLint, run without autofix over `app` and `src`, exits 1 with 106 errors and 167 warnings. Aggregate rule counts (all severities): 139 unused-variable findings, 65 `react-hooks/refs`, 22 `react-hooks/set-state-in-effect`, 10 unescaped entities, 9 array-type findings, 7 require-import findings, and 5 exhaustive-dependency findings. Full per-rule counts are in `evidence/lint-baseline.json`.

Review hook/ref findings for runtime consequences before cosmetic cleanup. Do not blanket-disable hooks rules to reach a green baseline. This command includes colocated tests in `src` and does not cover the root `__tests__` folder. Lint was not run against either web reference.

## Independent findings not established by the green tests

- Direct pullsheet fallback violates the intended command-only strategy and supplied write rules.
- Pending-operation storage performs unsynchronized AsyncStorage read-modify-write and suppresses persistence failures.
- Absolute mobile scan counts can lose concurrent increments; repeated bulk barcodes interact incorrectly with server deduplication.
- Status reconciliation lacks a request timeout and does not verify response operation identity before clearing the record.
- Repair/photo/logistics permissions are incompatible with supplied rules; mocked success does not resolve that.
- Equipment/repair/availability can disagree after partial writes.
- Whole-string logistics note appends and serial-array rewrites can lose other writers' changes.
- Auth hydration, scoped drafts/buffers, GPS timestamps and background restart need dedicated lifecycle checks.

## Validation layers required later

1. Pure-domain and React tests: mobile interaction/state and known legacy formats.
2. HTTP contract tests: realistic text/JSON bodies, malformed responses, matching/mismatched IDs, timeouts after commit, retry identity, and rejected requests.
3. Existing backend/rules verification in an approved test environment: authentic token tenant mapping, receipt behavior, permissions, and concurrent operators. Do not deploy modified rules or web code.
4. Physical iOS/Android builds: native photo bytes, permission revocation, GPS lifecycle, account switching, network loss, and camera navigation.
5. Release configuration checks and web compatibility smoke tests using approved nonproduction records.

No production writes, Firebase emulator run, native build, or physical-device test was performed during this baseline. Test names containing “E2E”, “security”, or “integration” must not be reported as those validation layers merely because they pass Jest.
