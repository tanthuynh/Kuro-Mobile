# Phase 2A: UI and test reconciliation

Scope: Kuro Mobile only. No web, shared infrastructure, database, GPS service, dependency, or deployment changes.

## Plan and decisions

1. Review the 31 remaining UI/GPS interaction failures against the existing layouts.
2. Preserve the current event layout, compact section headings, Start itinerary row, notes prompt, and tracking badge location. Update tests to exercise those interfaces without restoring removed presentation elements.
3. Restore the missing torch control on the standalone scanner. Let the event screen suppress that control because its scanner toolbar already supplies one.
4. Isolate tracking mocks and test state so an unused mocked response cannot leak into the next permission-alert test.
5. Run affected suites, typecheck, and the full suite. Keep the two repair partial-failure tests unchanged for Phase 2D.

## Implementation

Runtime changes are limited to:

- `src/components/scanner/camera-viewfinder.tsx`: accessible 48-point torch button when the native camera is active and a toggle callback is supplied; optional suppression by the parent.
- `app/events/[id].tsx`: suppress the duplicate viewfinder button, preserving the event toolbar's existing torch control.

Tests now locate tracking state in job details and job status in the header. They distinguish the Start row label from the Start tracking button, use destination rows for map/call actions, retain disabled/invalid-input and URL-sanitization coverage, and verify the current notes prompt and compact event/section layouts. The workflow fixture includes an origin before its destination stops.

The logistics detail tests restore spies and reset tracking state between cases. The apparent permission-alert sequencing failures were caused by leftover mock responses after earlier assertions failed; no GPS service change was needed for these failures.

Additional checks cover the Start-row/destination distinction and parent-controlled torch behavior. Existing scanner tests exercise the restored button callback and haptic path.

## Validation and limits

See `evidence/` for command output and Jest results. Typecheck and `git diff --check` pass. The affected rerun passes 53 tests across four suites; the earlier run passed the other six affected suites.

Final full run: **89 passing / 1 failing suites; 1,647 passing / 2 failing tests** (90 suites, 1,649 tests total). All 31 previously recorded UI/GPS interaction failures are resolved. The only failures are the unchanged `HRD-ERR-01` and `HRD-ERR-02` repair partial-failure tests reserved for Phase 2D. See [full.json](evidence/full.json) and [full.log](evidence/full.log).

These are mocked React Native/Firebase/location/camera tests, not physical-device or deployed-backend evidence. Phase 2B still needs to validate GPS behavior on devices. The existing repair partial-failure and production compatibility blockers remain unchanged. No app was published or deployed.

Pre-existing uncommitted Phase 1 changes were preserved; do not discard them when reviewing or committing this phase.
