# Fixed web contracts and mobile adaptation

All paths below are relative to mobile or the explicitly labeled web reference. Evidence is source inspection, not deployed behavior. Full candidate web root: `C:\Users\Tan\Documents\Amia Studios\Kuro\ems1`; authority of that full path is pending confirmation. The workspace `ems1` contains the same kinds of pullsheet routes and rules but is not a complete web source tree.

## Contract map

| Workflow | Existing mobile access | Fixed-web evidence / constraint | Mobile-only disposition |
| --- | --- | --- | --- |
| Tenant lookup | Firebase callable `lookupAuthTenantId`, `{email}`; then tenant-scoped Firebase Auth | `functions/src/lookupAuthTenantId.ts` in workspace ems1 returns `{success:true, authTenantId}`; it does not promise business tenant ID/name. Region is Singapore | Treat auth tenant and business tenant separately; hydrate business tenant from authenticated profile. Do not invent endpoint response fields |
| Profile/session | Firestore `users`, `roles`, `tenants`; persisted profile and tenant lookup | Source rules require auth and tenant membership for private reads; tenant claim matching must be verified with real tokens | Cache is display/recovery state, not authorization; guard async hydration by UID/tenant/session |
| Presence | RTDB `presence/{uid}/activeSessions/mobile`, `connections`, `profile`, `lastChanged`, `lastChanged_mobile`, admin signal fields | RTDB permits owner writes to `presence/{uid}`. Existing protocol separates mobile/web slots | Never mutate `activeSessions/web`; verify cleanup only removes mobile ownership and does not clobber shared presence |
| Events | Firestore `events`, `event-types`; events require tenant + `archived == false`, limit 150, then client date filtering | Shared fields and archive meanings fixed | Fix completeness without new schema/index deployment; mark partial datasets explicitly until verified query strategy exists |
| Equipment | Shared tenant Firestore listener on `equipment`; archive filtering in memory | `equipment-cache.ts` ref-counts by UID/tenant/scope | Retain lookup compatibility; do not silently exclude legacy documents with absent archive fields; establish existing indexes before query changes |
| Pullsheet read | Firestore `pullsheets/{eventId}` | Document embeds `items[]`; references/costs/sections and web fields belong to shared contract | Do not split documents, regenerate line IDs, normalize-write full records, or migrate arrays |
| Pullsheet mutation | Bearer-auth POST `/api/pullsheets/command` | Existing ems1 route: `increment_scan`, `update_status`, `bulk_confirm`; transaction writes pullsheet plus `receipts/{operationId}` | Use the existing endpoint exclusively once deployed availability is established; preserve exact retry payload/operation ID |
| Pullsheet receipt | Bearer-auth GET `/api/pullsheets/command/status?eventId=...&operationId=...` | Existing route returns committed result or `success:true,status:not_found`; missing pullsheet is HTTP 404; reconciliation status is separate | Distinguish missing receipt from missing route/document and from authorization errors; validate returned operation identity |
| Repair read | Firestore `tickets`; `contacts` and `users` lookups | Tenant tickets currently fetched without pagination; entity documents mirror repair attachments/notes | Preserve unknown fields and existing arrays; introduce no new shared fields |
| Repair commands | POST `/api/repairs/command`; GET `/api/repairs/command/status` | No such routes found in either inspected ems1 source tree. Full candidate uses server-only repair actions | Not a usable contract until an existing deployed equivalent is verified. Do not add routes or invoke private action internals |
| Repair writes | Direct writes to tickets, equipment serial arrays, `tenants/{tenant}/entity_documents/repair-{ticket}/items`; RTDB `availability/{tenant}/r/{ticket}` | Source Firestore rules deny client writes; RTDB availability writes denied | Release blocker under supplied rules; mobile cannot manufacture permission or cross-database atomicity |
| Repair photos | Storage `tenants/{tenant}/entity_documents/repair-{ticket}/{fileName}` plus entity document registration | Source Storage rules only allow authenticated chat paths | Existing photo path is denied by supplied rules. No upload path substitution into chats; no rules changes |
| Logistics reads | Firestore `logistics` tenant + archive query, single document, `vehicles/{id}` | Full candidate's schemas own status meanings; source rules deny client writes; location history has no allow rule in workspace ems1 | Do not assume history read/write permission from root document permission |
| Logistics writes | Direct status/notes/currentLocation/tracking fields, `location_history/{timestamp}` | No general mobile logistics command route found | Blocker under supplied rules. Local buffering/feedback may improve independently; live write availability remains unverified |

## Pullsheet compatibility details

References: mobile `src/services/pull-sheet-service.ts:416`, `:494`, `:549`, `:722`, `:912`; ems1 `src/app/api/pullsheets/command/route.ts:42`, `:300`, `:347`, `:363` and status route.

- Command input: `operationId`, `eventId`, `tenantId`, `action`, with action-specific `itemId`, `barcode`, `newStatus`, optional `scannedCount`, optional `autoTransitionToPrepped`.
- A validated successful POST has `success:true`, `status:committed`, matching `operationId`, and optional `result.updatedItem`, `result.pullsheetSummary`, `reconciliationStatus`.
- Existing server fallback when `scannedCount` is absent is `currentScanned + 1`, inside its transaction. Omitting this mobile field is a potential fix for stale absolute counts without changing web.
- Also omit the client-derived automatic transition flag for ordinary increments so the existing server computes completion from its own count. Establish exact intended behavior for any manual overrides separately.
- Server deduplicates **any** supplied repeated barcode, without checking whether equipment is serialized. A mobile bulk scan cannot simply send the same product barcode repeatedly and expect increments. Determine serialized identity versus repeatable bulk code using existing equipment fields; preserve legacy receipts unchanged.
- Server increment has no strict quantity cap and status update accepts weakly validated input. Mobile validation improves normal UX but cannot impose global guarantees on other clients or concurrent final-unit scans. Record that residual limitation; never claim mobile locking is a server lock.
- Current mobile 404/5xx/408/499 fallback performs direct read-modify-write on the items array. This conflicts with the fixed rules and bypasses receipts. Its removal is proposed, not performed in Phase 0.
- `reconcile_side_effects` hashes the changed action and compares it with the original receipt hash; mobile currently sends only IDs and that action. This is incompatible with ordinary mutation receipt hashes. Do not propose changing that fixed route. The existing original-command replay path can reattempt reconciliation for an existing matching receipt; verify deployed behavior and original payload preservation before using it for recovery.
- A committed business write and failed allocation reconciliation are different outcomes. Retain enough local information to explain/recover partial completion without issuing a new mutation ID.

## Schema differences to resolve in mobile

Full candidate evidence: `src/lib/definitions.ts:25`, `src/app/repair/definitions.ts`, `src/app/repair/schema.ts`. Mobile evidence: `src/types/repair.ts`, `src/lib/repair-engine.ts`, `src/types/logistics.ts`.

| Field | Mobile | Full web candidate | Required decision |
| --- | --- | --- | --- |
| Repair cancellation | `Cancel` | `Cancelled` | If full checkout confirmed, write canonical web value; tolerate legacy reads without rewriting unrelated records |
| Repair priority | None, Low, Medium, High, Deferred, Critical | Low, Medium, High | Restrict future write choices to verified contract; do not silently remap stored unusual priorities or erase them on unrelated edits |
| Logistics status | Broad union, including In Transit/En Route/Arrived and arbitrary string | Pending, Planned, In Progress, Completed, Cancelled | Audit actual UI mutation paths against canonical list; retain legacy display support |
| Fault description | Older tests require `initialNote`; current new screen uses unified details and internal notes | Full candidate repair schema does not require fault description | Treat mandatory-description failure as requirement drift until fixed-web behavior is confirmed; do not restore an obsolete form just to satisfy selectors |
| Attachments | Mobile type permits Document and arbitrary string | Shared candidate attachment schema uses Photo/PDF/URL | Verify consuming web paths and limit emitted types without rewriting existing metadata |

## Query/index boundary

The mobile repository has a tickets `(tenantId ASC, repairNumber DESC)` index definition. The supplied ems1 Firebase configuration references rules but does not declare that index file. Neither fact proves the index exists in production. No index is deployed in this phase.

Record-count thresholds and costs remain unmeasured: no live tenant download was performed. For later validation, use approved representative fixtures with more than 150 events, archived/missing-archive records, large equipment serial lists, and multiple simultaneous operators. Optimize without dropping valid records or expanding access.

## External verification still required

Confirm full authoritative ems1 path, production API host/release, effective Firestore/RTDB/Storage rules and indexes, and the distinction between Identity Platform auth tenant IDs and business tenant IDs. Source equality is not deployment evidence. Under the currently supplied rules, repair/logistics write functionality cannot be made fully operational solely through mobile changes. Preserve this as a blocker rather than promising an unsupported workaround.
