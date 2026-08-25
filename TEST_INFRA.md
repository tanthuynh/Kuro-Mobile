# E2E Test Infra: Kuro Mobile (Repair & Fault Logging)

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests are derived directly from `ORIGINAL_REQUEST.md` (R1-R5) and user-facing requirements, verifying behavior from an end-user / field technician perspective.
- **Strict Tenant Isolation**: Ensures tenant isolation is guarded against leaks.
- **Pure Engine & Reactive Service Verification**: Tests pure state machine logic in isolation and Firestore subscription lifecycles.
- **Systematic 5-Tier Methodology**:
  - Tier 1: Feature Coverage (>=5 tests per feature)
  - Tier 2: Boundary & Corner Cases (>=5 tests per feature)
  - Tier 3: Cross-Feature Combinations (Pairwise coverage)
  - Tier 4: Real-World Application Workloads & Workflows
  - Tier 5: Adversarial Coverage Hardening (Stress, security, and integrity verification)

---

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|----------------------|:------:|:------:|:------:|:------:|
| F1 | Repair Types & Schemas | ORIGINAL_REQUEST §R1, §R3 | 5 | 5 | ✓ | ✓ |
| F2 | Pure Engine & State Machine | ORIGINAL_REQUEST §R1, §R3, §R4 | 5 | 5 | ✓ | ✓ |
| F3 | Firestore & Storage Services | ORIGINAL_REQUEST §R1, §R3, §R4 | 5 | 5 | ✓ | ✓ |
| F4 | Scan-to-Repair Navigation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F5 | Pre-filled Fault Reporting Form | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F6 | Photo & Evidence Attachment | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F7 | Real-Time Repair Tickets Feed | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F8 | Repair Ticket Details View | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F9 | Technician 1-Tap Status Updates | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F10 | Action & Note Logging Audit Trail | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F11 | Equipment Operational Condition Sync | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F12 | Read-Only Reference Preservation | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |

---

## Test Architecture
- **Test Runner**: Jest 29 with `jest-expo` preset and `@testing-library/react-native`.
- **Invocation**:
  - Full suite: `npm test` or `npx jest`
  - Typecheck: `npm run typecheck` or `npx tsc --noEmit`
- **Pass / Fail Semantics**: Zero failures, 0 TypeScript errors, 100% assertions passing.

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Warehouse Scanner to Out-of-Service Ticket Creation | F4, F5, F6, F11, F3 | High |
| 2 | Field Technician Quick Status Transition to Awaiting Parts with Note | F7, F8, F9, F10, F3 | Medium |
| 3 | Ticket Resolution and Equipment Restoration to Available to Use | F8, F9, F10, F11, F3 | High |
| 4 | Multi-Tenant Real-Time Live Feed Stream & Filter Switching | F7, F8, F3 | Medium |
| 5 | Heavy Multi-Attachment Photo Documentation & Audit Inspection | F6, F8, F10, F3 | High |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 60 unit tests across pure engines and services
- **Tier 2 (Boundary & Corner Cases)**: ≥ 60 boundary and negative tests
- **Tier 3 (Cross-Feature Pairwise)**: ≥ 25 integration tests across navigation, hooks, and modals
- **Tier 4 (Real-World Workloads)**: ≥ 10 end-to-end component workflow tests
- **Tier 5 (Adversarial Coverage Hardening)**: ≥ 15 stress, security, and edge-case tests
