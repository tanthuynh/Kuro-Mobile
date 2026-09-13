# Phase 1: mobile correctness and fixed-web compatibility

Date: 2026-09-13. Mobile implementation complete; production rollout gates remain open.

## Scope and ownership

The user confirmed `C:\Users\Tan\Documents\Amia Studios\Kuro\ems1` as the authoritative web reference. It was read only. The mobile application adapts to its existing routes and data values. No web code, Firebase rules, indexes, shared schema, database records, Storage objects, dependencies, or production deployment were changed by this work.

The source fingerprint comparison checked 732 web source files: no changed, missing, or added files. See [verification](evidence/web-source-verification.json). Source inspection does not establish which revision or rules are deployed.

This workspace already contained edits to the event, logistics, repair, destination, notes, section-header, and camera screens. Those edits were preserved. During implementation an external commit, `31d0795` (`0.1.4b`), incorporated most working changes and a scripts exclusion in `tsconfig.json`. This agent did not create that commit or edit the TypeScript configuration. Later refinements and this handoff may remain uncommitted; review the complete implementation against `c503c52`, with those pre-existing edits kept separate.

## Implemented

### Pullsheet writes and recovery

- Removed the direct Firestore mutation fallback. New writes use the existing authenticated pullsheet command API exclusively.
- Ordinary scans omit absolute counts and automatic-completion flags, allowing the existing server transaction to increment its current count. Legacy retries preserve the exact original envelope, timestamp, operation ID, and count semantics.
- Bulk product codes are excluded from barcode deduplication. Serialized scans use canonical unit identities, including consistent identity across single-asset barcode/serial aliases. Ambiguous model codes and unavailable linked equipment metadata are rejected before dispatch.
- Recovery records are persisted before dispatch; storage changes are serialized per user/tenant. Storage errors prevent new dispatch. In-flight guards reject conflicting rapid actions while allowing independent item commands at the service layer.
- Both request and response-body reads, including receipt polling, have deadlines. Polling is bounded. Matching operation IDs and valid acknowledgement states are required; unknown outcomes remain recoverable.
- A committed command with pending/failed inventory synchronization retains its original payload. Explicit recovery replays that payload through the existing receipt path, rather than sending the incompatible changed-action request.
- Local recovery subscriptions expose save state immediately on the event pullsheet, including scanner-originated saves. Status checks and explicit original-save retries are available there.
- Removed optimistic count/status overlays and stale rollback behavior. Server acknowledgements cannot overwrite a newer live snapshot. Completion feedback requires confirmed state and successful synchronization; stale session responses do not update the current session. A recovery-refresh failure after acknowledgement is reported as saved, not as a failed mutation.

### Shared-format compatibility

- Mobile's existing repair Cancel action emits `Cancelled`.
- New repair priorities are restricted to `Low`, `Medium`, and `High`; unsupported legacy priorities are preserved during unrelated edits.
- New attachments accept the web's `Photo`, `PDF`, and `URL` types. Existing attachments are not migrated or rewritten during unrelated edits.
- Logistics status writes use `Pending`, `Planned`, `In Progress`, `Completed`, or `Cancelled`. The selector now offers `Planned`; new entries default to `Pending`.
- No shared-array redesign or migration was attempted. Existing unsafe/unavailable backend paths remain explicit blockers.

### Tests and existing form behavior

- Updated HTTP fixtures to provide text bodies and matching receipt identities, with durable retry envelopes.
- Updated affected repair tests to exercise the current internal-notes modal and required equipment-name validation. Fault description is not a mandatory field in the verified web schema.
- Restored the existing Add Photo handler to the new-ticket gallery: the current screen otherwise had no visible way to attach a photo before submission.
- Updated affected mutation fixtures to web-supported values and confirmed-response semantics. The two repair partial-failure tests remain unchanged and failing, as required by the Phase 1 plan.

## Validation

- `npm run typecheck`: passes on the final checkout. Earlier runs failed in the existing `scripts/remove-event-notes.ts`; the external configuration change now excludes scripts. That utility was not fixed or validated by this work.
- The 11 targeted suites passed 248 tests at the recorded targeted checkpoint. A later additional acknowledged-save regression test also passed in the full run. Two further affected suites passed 19 tests after their fixture corrections.
- Latest per-suite results: **79 passing / 11 failing suites; 1,614 passing / 33 failing tests**. This combines the final full run with the subsequent two fixture-only reruns; it is not a claim that the full suite is green. Exact names and provenance are in [latest-validation-summary.json](evidence/latest-validation-summary.json).
- Remaining failures: 31 tests around pre-existing event/logistics/camera UI expectations and GPS interactions, plus the two deferred repair partial-failure tests. Missing map/call/torch controls and GPS alert sequencing still need review; they must not be assumed harmless solely because some selectors are stale.
- Focused ESLint: pullsheet service, scanner engine, and web-write adapter have no errors/warnings. Scanner context and pullsheet hook retain nine existing React ref/effect-pattern errors. Broader lint cleanup is not claimed.
- `git diff --check`: passed for the final working diff.

Jest uses mocked HTTP, Firebase, native APIs, and storage. Simulated concurrency/rules tests are not deployed-backend, emulator, physical-device, or release-build evidence. No store submission or live mutation test was performed.

## Rollout gates and fixed-backend limits

1. Verify the production API base URL, deployed revision, auth claims, and effective rules against the inspected reference using an approved nonproduction tenant first.
2. The fixed pullsheet server does not cap simultaneous increments at the requested quantity or fully enforce status transitions. Mobile guards reduce mistakes but cannot guarantee invariants against other clients. Original command replay also preserves any legacy absolute-count behavior; it cannot safely rewrite an existing receipt's payload.
3. Repair/logistics direct writes and repair-photo paths have no verified authorized production path under the supplied rules. Format alignment does not solve that access limitation. No rules were relaxed and no new backend was introduced.
4. Repair creation can still swallow equipment/RTDB partial failures. A safe fix must preserve the created ticket identity and avoid duplicate tickets/photos on retry. Keep the two failing tests as evidence until that design is approved and implemented.
5. Resolve the outstanding UI/GPS regressions, then perform physical iOS/Android checks for camera, disconnect-after-save, restart recovery, account switching, and simultaneous operators. Store builds and platform permission/store qualification remain later phases.

Do not treat this phase as approval to deploy. Review these mobile changes and unresolved gates before starting the next implementation phase.
