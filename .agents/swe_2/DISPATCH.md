# Dispatch Log

## 2026-08-30T11:19:12Z

Comprehensive UI, service, and workflow refactor for the Repair module in Kuro Mobile:
1. Single Text Input with Autocomplete for Equipment, Requester, and Supplier:
   - Inline autocomplete dropdown/suggestions list for single text inputs.
   - Equipment Name: user can type custom or tap inventory item suggestion.
   - Serial Number: suggestions populated from inventory item's available `serialNumbers`, allowing custom serial entry.
   - Requested By & Supplier: single text input with tenant crew / contacts autocomplete and free-text support.
2. Combined Row 2: 5 Equal Boxes (Priority & Condition):
   - Row 2 has 5 equal-width (`flex: 1`) boxes on the same horizontal row: Low, Medium, High, Available to Use, Out of Service.
3. 5-Second Debounced / Pooled Mutation Saving:
   - Buffer & pool pending changes locally with optimistic UI updates.
   - Flush accumulated mutations to Firestore after 5s inactivity or immediately on unmount/navigation away.
4. Unified Repair Detail & New Fault Report Screen:
   - Reuse Repair Detail layout for creating new repair tickets (`/repair/new`), replacing old `NewRepairScreen`.
   - Support pre-filling equipment metadata from QR scanner/inventory navigation params and provide a clear "Create Ticket" action when in new mode.
5. Mobile Date Scroller for Repair Period:
   - 3-column mobile date scroller/picker (Day, Month, Year) with Start Date at top and End Date at bottom, plus quick preset chips (Today, 3 Days, 1 Week, 2 Weeks, Clear).
6. Terminology, Typography & List Card Simplification:
   - Rename "Damage Photos" -> "Images" and "Documents & Specifications" -> "Documents".
   - In `RepairTicketCard`, display Priority and Condition as clean normal text instead of badge pills.
7. Verification & Tests:
   - `npm run typecheck` passes with 0 errors.
   - `npm test` passes all 45+ test suites, with repair detail, new ticket, and feed test suites updated for the new layout and autocomplete behavior.
