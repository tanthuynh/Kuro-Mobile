# Project: Kuro Mobile — Repair & Fault Logging

## Architecture
Kuro Mobile is a React Native / Expo application designed for field technicians and warehouse crew.
The Repair & Fault Logging module integrates seamlessly with the existing multi-tenant architecture and mirrors `kuro-web` (read-only reference) data models, validation rules, and real-time synchronization.

### System Components & Data Flow
1. **Presentation Layer (React Native / Expo Router)**:
   - `app/(tabs)/_layout.tsx`: Navigation tab bar hosting the "Repairs" tab (Wrench icon).
   - `app/(tabs)/repairs.tsx`: Real-time active repair tickets feed with multi-criteria status/priority filters and search.
   - `app/(tabs)/scanner.tsx`: Barcode / QR scanner HUD with direct "Report Fault / Log Repair" action button on scanned equipment.
   - `app/(tabs)/inventory.tsx`: Asset detail inspection modal with "Report Fault" action.
   - `app/repair/new.tsx`: Scan-to-repair fault creation screen with pre-filled equipment specs, priority selector, condition toggle, damage description, and camera photo capture.
   - `app/repair/[id].tsx`: Comprehensive ticket detail screen displaying equipment specs, condition status, photo gallery (with full-screen modal), parts used, technician 1-tap quick status updates, and chronological audit action logs.
2. **Domain & Engine Layer (`src/lib/`)**:
   - `src/lib/repair-engine.ts`: Pure functional logic for ticket validation, status state machine transitions, equipment condition mapping (`Under Repair`/`Awaiting Parts` $\to$ `Out of Service`, `Operational`/`Completed` $\to$ `Available to Use`), multi-filter search predicates, and audit action log generation.
3. **Data & Services Layer (`src/services/` & `src/context/`)**:
   - `src/types/repair.ts`: Type definitions matching `kuro-web` schemas (`RepairTicket`, `RepairStatus`, `RepairPriority`, `RepairActionLog`, `RepairAttachment`, `EquipmentCondition`).
   - `src/services/repair-service.ts`: Firestore CRUD and real-time subscriptions (`onSnapshot`) scoped to `tenantId`, sequential repair number handling, equipment condition updates in `/equipment`, RTDB availability ledger sync (`availability/{tenantId}/r/{ticketId}`), and photo upload helper to Firebase Storage.
   - `src/hooks/use-tickets.ts`: Reactive hook providing real-time ticket feeds, filtering state, and mutation helpers.
4. **Codebase Preservation Guardrail**:
   - `kuro-web/` is strictly **READ-ONLY**. Zero files modified or created in `kuro-web/`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Repair Types & Schema | Core TypeScript types, schemas, and enums matching `kuro-web` (`tickets`, `actions`, `notes`, `attachments`, `condition`) | M1 | ORIGINAL_REQUEST §R1, §R3 |
| F2 | Repair Pure Engine | Validation, state transitions, condition mapping, filtering, and action log generator | M1 | ORIGINAL_REQUEST §R1, §R3, §R4 |
| F3 | Firestore & Storage Services | Multi-tenant Firestore queries, `onSnapshot` subscriptions, ticket creation/updates, equipment status sync, and image storage | M1 | ORIGINAL_REQUEST §R1, §R3, §R4 |
| F4 | Scan-to-Repair Workflow | Barcode / QR scan with instant "Report Fault" action and pre-filled equipment details | M2 | ORIGINAL_REQUEST §R1 |
| F5 | Fault Reporting Form | Form with fault description, priority selection (`Low`, `Medium`, `High`, `Critical`), repair type, and `Out of Service` condition | M2 | ORIGINAL_REQUEST §R1 |
| F6 | Photo & Damage Evidence Capture | Camera / gallery photo capture (`expo-image-picker`/`CameraView`), attachment thumbnail list, and full resolution preview | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Real-Time Repair Tickets Feed | Live tenant ticket stream with status filters (`Under Repair`, `Awaiting Parts`, `Operational`, `Completed`), priority filters, and search | M3 | ORIGINAL_REQUEST §R3 |
| F8 | Repair Ticket Details Screen | Equipment specs, fault history, photo gallery, parts used, and full audit action logs | M3 | ORIGINAL_REQUEST §R3 |
| F9 | Technician 1-Tap Status Updates | Quick status updates (`Under Repair`, `Awaiting Parts`, `Completed`, `Operational`) | M4 | ORIGINAL_REQUEST §R4 |
| F10 | Technician Action Notes Logging | Append timestamped technician action notes to tickets (`actions` and `notes`) without page reload | M4 | ORIGINAL_REQUEST §R4 |
| F11 | Equipment Operational Condition Sync | Synchronize equipment condition (`Out of Service` vs `Available to Use`) to prevent faulty gear from being dispatched | M4 | ORIGINAL_REQUEST §R4 |
| F12 | Read-Only Reference Preservation | Strictly enforce read-only status of `kuro-web/` | M1-M5 | ORIGINAL_REQUEST §R5 |

---

## Milestones
| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | Core Repair Domain, Types & Services | `src/types/repair.ts`, `src/lib/repair-engine.ts`, `src/services/repair-service.ts`, `jest.setup.js`, and unit/integration tests | none | DONE | `repair.ts`, `repair-engine.ts`, `repair-service.ts`, 28 test suites passing (470 tests) |
| M2 | Scan-to-Repair, Fault Reporting & Photo Capture | `app/repair/new.tsx`, photo capture components, scanner/inventory integration hooks, and workflow tests | M1 | DONE | `app/repair/new.tsx`, `repair-photo-gallery.tsx`, `scan-to-repair-workflow.test.tsx` (5/5 passing) |
| M3 | Real-Time Repair Tickets Feed & Detail View | `app/(tabs)/repairs.tsx`, `app/(tabs)/_layout.tsx`, `app/repair/[id].tsx`, `src/hooks/use-tickets.ts`, and component tests | M1 | DONE | `repairs.tsx`, `_layout.tsx` (Repairs tab), `[id].tsx`, `use-tickets.ts`, feed/detail tests (12/12 passing) |
| M4 | Technician Action Logs, Quick Updates & Equipment Sync | `src/components/repair/quick-status-selector.tsx`, `src/components/repair/add-action-note-modal.tsx`, equipment condition sync, and action logging tests | M1, M3 | DONE | `quick-status-selector.tsx`, `add-action-note-modal.tsx`, condition sync to `/equipment` |
| M5 | Final E2E Verification, Adversarial Hardening & Victory Audit | 100% E2E test pass (Tiers 1-4), adversarial test suite (Tier 5), TypeScript clean compilation, and Forensic Audit | M1, M2, M3, M4 | DONE | 32/32 test suites passed, 490/490 tests passed, 0 TS errors, CLEAN Victory Audit |

---

## Interface Contracts

### `src/types/repair.ts`
- `RepairStatus`: `'Under Repair' | 'Awaiting Parts' | 'Operational' | 'Completed' | 'Returned' | 'Decommissioned' | 'Archived'`
- `RepairPriority`: `'None' | 'Low' | 'Medium' | 'High' | 'Deferred' | 'Critical'`
- `EquipmentCondition`: `'Available to Use' | 'Out of Service'`
- `RepairActionLog`: `{ id: string; user: { id?: string; name: string; email?: string; avatarUrl?: string }; action: string; timestamp: string; tenantId?: string }`
- `RepairAttachment`: `{ id: string; type: 'Photo' | 'PDF' | 'URL'; url: string; fileName?: string; notes?: string; uploadedAt?: string }`
- `RepairTicket`: Root Firestore document interface with `tenantId`, `repairNumber`, `equipment`, `repairType`, `priority`, `status`, `condition`, `assignee`, `requestedBy`, `notes`, `attachments`, `partsUsed`, `actions`, `createdAt`, `updatedAt`.

### `src/lib/repair-engine.ts`
- `validateRepairTicketInput(input: Partial<RepairTicket>): { isValid: boolean; errors: string[] }`
- `calculateEquipmentCondition(status: RepairStatus): EquipmentCondition`
- `filterRepairTickets(tickets: RepairTicket[], filters: { status?: string; priority?: string; search?: string }): RepairTicket[]`
- `createActionLogEntry(user: { name: string; email?: string; id?: string }, action: string, tenantId?: string): RepairActionLog`
- `isValidStatusTransition(current: RepairStatus, next: RepairStatus): boolean`
- `getAvailableStatusTransitions(current: RepairStatus): RepairStatus[]`
- `getQuickStatusOptions(current: RepairStatus): RepairStatus[]`
- `calculateRepairCostTotal(parts: RepairPartUsed[]): number`

### `src/services/repair-service.ts`
- `subscribeTenantRepairTickets(tenantId: string, onUpdate: (tickets: RepairTicket[]) => void, onError?: (err: Error) => void): () => void`
- `createRepairTicket(tenantId: string, ticketData: Omit<RepairTicket, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>`
- `getRepairTicket(ticketId: string): Promise<RepairTicket | null>`
- `updateRepairTicketStatus(ticketId: string, newStatus: RepairStatus, user: { name: string; id?: string }, tenantId: string, reason?: string): Promise<void>`
- `appendRepairAction(ticketId: string, actionText: string, user: { name: string; id?: string }, tenantId: string): Promise<void>`
- `appendRepairNote(ticketId: string, content: string, user: { name: string; id?: string }, tenantId: string): Promise<void>`
- `uploadRepairDamagePhoto(tenantId: string, ticketId: string, localUri: string): Promise<string>`

---

## Code Layout
```
kuro-mobile/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx                  # Adds 'repairs' tab with Wrench icon
│   │   ├── repairs.tsx                  # Real-time ticket feed screen
│   │   ├── scanner.tsx                  # Scan screen with "Report Fault" action
│   │   └── inventory.tsx                # Inventory screen with "Report Fault" button
│   ├── repair/
│   │   ├── new.tsx                      # Scan-to-repair fault creation screen
│   │   └── [id].tsx                     # Repair ticket detail view screen
├── src/
│   ├── types/
│   │   └── repair.ts                    # Repair TypeScript definitions matching kuro-web (COMPLETED)
│   ├── lib/
│   │   └── repair-engine.ts             # Pure repair domain engine & state transitions (COMPLETED)
│   ├── services/
│   │   └── repair-service.ts            # Multi-tenant Firestore & Storage services (COMPLETED)
│   ├── hooks/
│   │   └── use-tickets.ts               # React hook for real-time ticket subscription & filters
│   └── components/
│       ├── repair-ticket-card.tsx       # Ticket list item card component
│       ├── repair-photo-gallery.tsx     # Photo gallery & full-screen preview lightbox
│       ├── quick-status-selector.tsx    # 1-tap quick status transition pills
│       └── add-action-note-modal.tsx    # Modal to append technician notes/actions
└── __tests__/
    ├── repair-engine.test.ts            # Tier 1-2: Unit tests for repair engine logic (COMPLETED)
    ├── repair-service.test.ts           # Tier 1-2: Integration tests for Firestore & Storage service (COMPLETED)
    ├── scan-to-repair-workflow.test.tsx # Tier 3-4: Workflow tests for scan -> form -> photo -> submit
    ├── repair-tickets-feed.test.tsx     # Tier 3-4: Component tests for real-time feed & filtering
    ├── repair-ticket-detail.test.tsx    # Tier 3-4: Component tests for details & 1-tap updates
    └── repair-adversarial.challenge.test.ts # Tier 5: Adversarial multi-tenant, stress & error tests (COMPLETED)
```
