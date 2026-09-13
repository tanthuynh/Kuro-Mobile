# Proposed Phase 1: adapt mobile to the fixed web contract

Status: plan only. No runtime implementation in Phase 0. No web/backend/rules/schema/index changes are allowed.

## 1A. Restore trustworthy mobile tests

Owned files: the five failing suites listed in `test-triage.md`; use a narrowly scoped test response helper if helpful. Avoid broad changes to global mocks.

- Make HTTP mocks implement the actual response interface used by mobile, including malformed/non-JSON bodies and matching receipt IDs.
- Confirm the unified repair form and note behavior against the authoritative web contract. Retain meaningful validation and interaction coverage; do not replace functional assertions with source-string checks.
- Keep swallowed partial-failure tests red until a safe behavior/retry design exists; do not assert success merely because the ticket document was written.
- Gate: all baseline failures explained; every changed expectation tied to verified intended behavior. Report unresolved failures explicitly.

## 1B. Pullsheet command correctness and recovery

Owned files: `src/services/pull-sheet-service.ts`, `src/context/scanner-context.tsx`, `src/hooks/use-pull-sheet.ts`, relevant scanner/pullsheet tests; UI changes only where necessary to expose correct save states.

- Remove direct-write fallback; use the existing authenticated command path. A missing endpoint is a capability failure, not permission to write Firestore directly.
- For new ordinary scans, omit client absolute count and derived automatic-transition flag to use the existing server increment branch. Classify serialized vs bulk codes using existing equipment metadata. Verify old receipts separately; never change payload semantics when replaying a stored operation.
- Persist operations before dispatch, serialize local storage updates, and scope them by verified user/tenant. Add synchronous in-flight guards to prevent rapid taps/scans racing the durable pending check.
- Validate response structure and operation identity; bound both request and response-body/status-read duration. Keep uncertain outcomes recoverable through the existing receipt endpoint and original operation replay.
- Separate committed scan state from allocation-reconciliation state. Investigate existing original-command replay for failed reconciliation; do not use the incompatible changed-action recovery request or modify the web route.
- Use server returned item state for acknowledgement and completion feedback; stale mobile estimates are not commit evidence.
- Gate: response loss after commit, duplicate retries, two operators, repeated bulk scans, serialized duplicates, app restart, account switch, storage failure, and endpoint/permission failures. Document uncapped concurrent scans and other fixed-backend limits instead of claiming global correctness.

## 1C. Shared-format compatibility

Owned files: mobile repair/logistics types, engines, adapters, and affected UI/tests only.

- After exact reference confirmation, align emitted status/priority/attachment values with web contracts.
- Preserve legacy/unknown values on reads and unrelated edits; no migration or silent lossy remapping.
- Use narrow updates that preserve web-owned fields, line IDs, arrays, and references. Where shared-array changes cannot be made safely through an existing authorized path, record a blocker.
- Gate: fixture round trips preserve unrelated fields and legacy values; new supported values are accepted by fixed web schemas. No new Firestore fields or indexes.

## Deferred or blocked work

Repair commands/photos and logistics writes have no verified authorized production path under the supplied source rules. Do not remove working behavior or introduce blanket read-only mode without first verifying deployed capabilities and reviewing the resulting UX. Do not add a backend, modify shared rules, or tunnel requests through private web Server Actions.

Repair failure propagation/retry must preserve an already-created ticket ID and avoid duplicating attachments or tickets after partial success. This is a separate design gate, not a quick catch/rethrow patch.

Query improvements, auth/session isolation, GPS durability, and store qualification remain later phases. They may proceed as explicitly reviewed mobile-only work, but must not be used to imply the unresolved backend compatibility is solved.

## Review and rollback

Deliver small mobile-only diffs, list tests and remaining limitations, and compare fixed-web fingerprints before/after. No dependency upgrade or shared schema migration is required by this plan. Runtime rollout stays blocked until the deployed API/rules and nonproduction compatibility checks are verified.
