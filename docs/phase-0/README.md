# Phase 0: mobile baseline and fixed-web compatibility

Date: 2026-09-13. Scope: Kuro Mobile only. This is a baseline and implementation handoff, not a release approval.

## Outcome

- Mobile source, tests, configuration, services, and shared data dependencies reviewed.
- User identified `ems1` as the authoritative web application. The exact full checkout path still needs confirmation: the workspace `ems1/src` contains only two API route files; the fuller candidate at `C:\Users\Tan\Documents\Amia Studios\Kuro\ems1` contains 723 source files.
- Fresh mobile typecheck passes. Jest: 82 passing / 5 failing suites; 1,603 passing / 15 failing tests. Every failure is recorded and classified in [test-triage.md](test-triage.md).
- Existing lint baseline: 106 errors and 167 warnings across `app` and `src`; no autofix applied.
- Existing API/schema/rules constraints are mapped in [contracts.md](contracts.md).
- The next proposed implementation is [phase-1-plan.md](phase-1-plan.md). It is not implemented or automatically authorized by completion of this audit.

## Ownership boundary

Only files under `kuro-mobile/` may be changed. Phase 0 adds documentation/evidence only. Runtime source, UI, tests, dependencies, package scripts, and configuration remain unchanged.

`kuro-web/`, both `ems1` references, and shared infrastructure are read-only. Do not modify or deploy web code, routes, schema, indexes, rules, Cloud Functions, Firestore/RTDB records, Storage objects, or production configuration to make mobile work. Do not treat a Next.js Server Action as a public mobile API. Do not use a privileged credential in mobile or relax rules.

Future mobile operations may perform their existing intended business writes only through verified authorized contracts, preserving web-owned fields and semantics. A mobile-only patch cannot guarantee concurrency against arbitrary other writers or repair missing server authorization.

## Checkout and configuration evidence

| Item | Observed value / limitation |
| --- | --- |
| Mobile | `C:\Users\Tan\Documents\Amia Studios\Kuro Mobile\kuro-mobile`; package version 0.1.4 |
| Mobile Git metadata | `main`, loose ref `c503c52a870cb9d52b9fe19ed5e04d36aeabafeb`; metadata is not proof of a clean working tree |
| Workspace web fragment | `Kuro Mobile\ems1`; loose master ref `17183f768c76debcf71f69ff8f01afe2770ac056`; only two files in `src` |
| Full web candidate | `Amia Studios\Kuro\ems1`; loose master ref `87ad2d1c88d062bead754eef4fc786f6d40f7e0e`; exact authority pending confirmation |
| Firebase | Mobile runtime `src/lib/firebase.ts` supports environment overrides with `kurorms` defaults; Functions region `asia-southeast1` |
| Duplicate configuration | `src/constants/config.ts` also declares Firebase defaults; runtime imports must be traced before any configuration change |
| Local API override | HTTP LAN development host on port 3000, not a verified production endpoint |
| Production API | Not supplied/verified. `eas.json` does not itself set `EXPO_PUBLIC_API_BASE_URL`; hosted EAS environment values unknown |
| Security/index deployment | Only source files inspected. Effective deployed rules, indexes, callable deployment, and production auth claims unverified |

Source fingerprints in `evidence/source-baseline.json` and `evidence/web-reference-baseline.json` record working files rather than inferring their content from Git refs. These are filtered inventories, not complete filesystem backups: dependency/build directories, Git, agent metadata, assets/public files, lockfiles, environment files, logs and coverage are excluded. No credentials or environment-file contents are copied into evidence.

End-of-audit observation: the workspace `kuro-web` directory disappeared after baseline capture. All 614 captured paths under that directory are now missing. The agent did not delete, move, or edit that directory and did not restore it. The remaining captured workspace files (mobile and ems1) and all 798 external ems1 reference files have unchanged hashes. This is an observed external workspace change, not a clean-workspace assertion; see `evidence/scope-verification.json`.

## Validation and reproduction

Run from the mobile directory, without changing sources:

```powershell
npm run typecheck
npm test -- --runInBand --silent --json --outputFile="$env:TEMP\kuro-phase0-tests.json"
node node_modules/eslint/bin/eslint.js app src --format json --output-file "$env:TEMP\kuro-phase0-lint.json"
```

The audit used the installed dependencies; no installs, upgrades, deploys, migrations, live mutation probes, or web builds were performed. Jest uses Firebase/native/AsyncStorage mocks. A passing test named “integration” or “security” is not emulator/rules evidence. In particular, the pullsheet suite contains its own simulated rules evaluator.

See `evidence/test-baseline.json` for all failing test names and `evidence/lint-baseline.json` for the lint result. `evidence/scope-verification.json` records the end-of-audit comparison against the captured source inventories.

## Phase 0 exit gates

| Gate | Status |
| --- | --- |
| Mobile-only ownership fixed | Complete |
| Local baseline and failure classification | Complete |
| Existing contracts mapped | Complete for inspected sources |
| Exact authoritative full web path | Awaiting confirmation; user confirmed name `ems1` |
| Production API URL and deployed release match | Open |
| Deployed rules/indexes/auth claims verified | Open |
| Approved nonproduction test tenant and representative data | Open |
| Emulator/device/release behavior validated | Deferred to later phases; not claimed |

The local Phase 0 package is complete with explicit external verification gates. It does not establish production compatibility. Do not ship repair/logistics write changes on the assumption that source rules differ from deployed rules. Safe local work in Phase 1 can be reviewed separately from these blockers.
