# Original User Request

## 2026-08-27T01:02:04+10:00

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Small, focused team

This is a single self-contained UI and service refactor; keep it small and focused. Refactor the repairs screen to combine the top metrics boxes into interactive filter buttons for the new hardcoded repair statuses (All, Reported, Pending, Under Repair, Completed). Remove the old pill-based status filters and the priority filter bar, adapting to a new backend structure where statuses are fixed rather than dynamic.

Working directory: c:/Users/Tan/Documents/Amia Studios/Kuro Mobile/kuro-mobile
Integrity mode: development

## Requirements

### R1. Interactive Status Metric Cards
Transform the existing metric cards at the top of the repairs screen into 5 interactive, selectable cards representing the fixed statuses: "All", "Reported", "Pending", "Under Repair", "Completed". Tapping a card should filter the repair tickets list.

### R2. UI Cleanup
Remove the existing pill-based status filter row and remove the priority filter bar entirely from the repairs screen.

### R3. Database & Service Adaptation
Analyze the existing `repair-service.ts` and types, and query the database to infer the new fixed status structure. Update the data fetching, state, and filtering logic to support the new hardcoded statuses instead of dynamic types.

## Verification Resources
- The existing Jest test suite (e.g., `npm test` for `__tests__/repair-tickets-feed.test.tsx` and `__tests__/scan-to-repair-workflow.test.tsx`).

## Acceptance Criteria

### UI & Interaction
- [ ] 5 metric cards are displayed at the top: All, Reported, Pending, Under Repair, Completed.
- [ ] Tapping a metric card visually highlights it as selected and correctly filters the list of tickets below.
- [ ] The old pill-based status filters and the priority filter row are completely removed from the UI.

### Data Integration & Verification
- [ ] The `repair-service` correctly fetches and maps the new hardcoded status strings from the database.
- [ ] The TypeScript types (e.g., in `types/repair.ts`) are updated to reflect the hardcoded statuses, and `npm run typecheck` passes with 0 errors.
- [ ] The Jest test suite (`npm test`) passes. Any tests broken by the UI/status changes must be updated to reflect the new design.

---
*Expecting this to run as one contained change rather than a full project.*
