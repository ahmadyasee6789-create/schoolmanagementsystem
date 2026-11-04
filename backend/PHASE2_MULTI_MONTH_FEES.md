**Phase 2 backend implementation review — 3 November 2026.** Implemented locally and ready for code review. The configured database was not modified, and no Alembic migration, deployment, frontend change, commit, or push was performed. Phase 3 has not started.

The preceding read-only readiness review found revision `h42a81f3b075`, the required Phase 1 columns/indexes/constraints, and consistent current fee and allocation totals. The user subsequently confirmed that the removed fees and all four removed payments were testing data and authorized continuation. That resolves the preservation question raised during the gate. Active enrollments without fee structures still need pricing before missing obligations can be generated; existing obligations can be collected without repricing, and advance-only collection does not require a structure.

**Implementation and architecture.** `StudentFee` remains one monthly obligation, identified by organization, student, session, and first-of-month date. `FeeTransaction` remains one actual cash receipt. `FeeAllocation` applies cash or previously received credit to obligations. No quarterly, half-yearly, or yearly fee tables were introduced. Discount rounding and allocations reuse Phase 1 services. Credit remains derived as payment amount minus that payment's allocation total.

One new table, `fee_collection_commands`, records idempotency and the original response for every multi-month or credit-only operation. A credit-only command has no new payment, receipt number, or receipt URL. Keeping its idempotency record outside `FeeTransaction` prevents credit applications from becoming fictitious revenue. Command ownership uses restrictive composite foreign keys; its organization/key pair is unique. Organization locking also prevents key reuse across the existing single-fee endpoint, multi-month cash payments, and credit-only commands.

**Files created in Phase 2.** Paths are relative to `backend/`.

| File | Purpose |
| --- | --- |
| `app/models/fee_collection_command.py` | Durable command audit and idempotency, including credit-only operations |
| `app/db/fee_command_security_v1.py` | Frozen RLS and public-role privilege restrictions for commands |
| `alembic/versions/i53b92a4c186_fee_collection_commands.py` | New, unapplied migration following h42 |
| `app/schemas/fee_collection.py` | Strict preview, collection, fee, allocation, credit, and receipt schemas |
| `app/services/multi_fee_collection.py` | Read-only preview, locked revalidation, generation, atomic collection and receipt snapshots |
| `app/services/fee_reads.py` | Student history, payments, allocations, credit and receipt information |
| `tests/test_fee_multi.py` | 28 functional/API/report tests |
| `tests/test_fee_postgres_phase2.py` | 9 PostgreSQL concurrency, rollback, constraint and RLS tests |
| `validation/render_phase2_receipts.py` | Synthetic receipt samples using SQLite only |
| `PHASE2_MULTI_MONTH_FEES.md` | This review and validation handoff |

**Files modified in Phase 2.** These are in addition to the existing Phase 1 working-tree changes.

| File | Change |
| --- | --- |
| `app/models/__init__.py` | Register command model |
| `app/models/fee_structure.py` | Explicit `rates_finalized` flag |
| `app/models/fee_transection.py` | Clarify receipt snapshot documentation; no further payment schema changes |
| `app/schemas/fee_structure.py` | Admin API supports future-rate confirmation |
| `app/services/monthly_fees.py` | Shared read-only quote, explicit admission selection, future-rate check and metadata locks |
| `app/services/fee_collection.py` | Shared key validator and cross-operation key collision check; preserve single-month contract |
| `app/routers/student_fee.py` | Preview/collection/read endpoints and grouped receipt dispatch |
| `app/routers/receptTemp.py` | Grouped and advance-only PDF rendering; preserve legacy renderer |
| `app/routers/reports.py` | Decimal totals, dated periods, overdue/future flags, historical fee classroom and withdrawn-student inclusion |
| `app/schemas/reports.py` | Add period/future/overdue information and `total_overdue` |
| `tests/test_fee_integrity.py`, `tests/test_fee_postgres.py` | Declare synthetic future rates final in existing fixtures |
| `tests/test_fee_backfill_preparation.py` | Assert the new single migration head and dependency |
| `tests/test_fee_postgres_phase1_migration.py` | Prepare its current-application compatibility case to apply i53 after h42; not executed |

**API contracts.** All new monetary values are decimal strings in JSON. Arithmetic uses `Decimal`; tuition discounts round half-up to cents once per monthly obligation. Existing single-month and report numeric response fields retain their formats.

| Endpoint | Behavior |
| --- | --- |
| `POST /fees/collection/preview` | Read-only calculation; returns current and proposed obligations, discounts, previous dues, credit, allocation order and preview identifier |
| `POST /fees/collection/multi` | Requires `Idempotency-Key` and `preview_id`; atomic collection or credit application |
| `GET /fees/students/{student_id}/history` | Monthly fees, balances, paid/partial/unpaid status, future/overdue flags, and session-level cash/credit summaries |
| `GET /fees/students/{student_id}/payments` | Cash receipts, each payment's allocations and currently available credit |
| `GET /fees/payments/{transaction_id}` | One payment and its current allocation/credit history |
| `GET /fees/payments/{transaction_id}/receipt-info` | Printable receipt data; new receipts preserve values at issue |
| `GET /fees/payments/{transaction_id}/receipt` | Existing URL; legacy single-month PDF or new grouped/advance PDF |

Student history and payment lists support optional `session_id`, `page`, and `limit` (maximum 200). Omitting session includes prior sessions. Credit is reported separately by session and cannot cross sessions. Access is organization-scoped and uses the existing financial permissions. Preview requires collection permission; read endpoints require fee-view permission.

Example preview request for a partial half-yearly payment:

```json
{
  "student_id": 123,
  "session_id": 6,
  "period_type": "half_yearly",
  "billing_periods": ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
  "admission_period": null,
  "exam_periods": [],
  "amount": "2000.00",
  "credit_amount": "0.00",
  "retain_excess_as_credit": false,
  "payment_method": "cash"
}
```

Confirm by sending the same body plus the returned `preview_id` to `/fees/collection/multi`, with a fresh 8–128-character ASCII `Idempotency-Key`. Preserve that complete body and key for retries. A retry with the original body returns the original response even after later payments; reusing the key for a different body returns 409. A changed or invalidated preview returns 409 and requires a fresh preview. A revised confirmation then uses a new key.

`period_type` supports `monthly`, `quarterly`, `half_yearly`, `yearly`, `custom`, and `advance_only`. The first four require exactly 1, 3, 6, and 12 explicit consecutive months. Custom supports up to 120 explicit months, including gaps. Months must be unique, valid `YYYY-MM` values and chronologically ordered. Presets are resolved into explicit months by the caller before submission. The server validates every selected month against the actual session and enrollment dates and never truncates a selection.

Preview responses include `obligations`, `previous_dues`, `credit_sources`, `available_credit`, `total_payable`, `cash_received`, `credit_used`, `allocations`, `remaining_due`, `new_advance_credit`, `remaining_advance_credit`, and `preview_id`, plus student/session labels. Proposed new obligations have `fee_id: null` and `generated: true`. Collection returns the command/payment IDs, receipt reference, actual allocations and resulting fee balances. A payment method is optional metadata (`cash`, `bank_transfer`, `cheque`, `other`) and is allowed only when receiving new cash; it does not integrate a payment processor.

**Monthly generation and fee heads.** Preview performs no insert, update, delete, flush or commit. It uses the shared quote calculator. Confirmation creates only selected missing obligations within the payment transaction. Existing obligations retain their stored tuition, discount, admission, exam and final amounts, even after structure/enrollment changes. New obligations use the active enrollment's class and discount and its organization/session fee structure.

Admission is optional in the new API: specify one `admission_period`. It cannot be charged a second time in the same session. Exam fees apply only to explicit `exam_periods`. Both must reference selected months. Requests to add heads to an already-issued snapshot are rejected rather than modifying that snapshot. The legacy Generate Fees endpoint retains automatic first-admission charging and its existing request/response shape.

**Future rates and advances.** `FeeStructure.rates_finalized` defaults to false, including for existing structures when the new migration is eventually applied. An administrator can explicitly set it through the existing structure create/update API. Missing future obligations are rejected until their session's rates are confirmed. Existing future obligations remain collectible without repricing. The legacy Generate Fees endpoint also enforces this future-rate check; clients may now receive 409 for provisional future fees.

This recommends on-demand generation for selected months when rates are confirmed, and unallocated advance credit when they are not. There is no automatic bulk generation of all future session fees. The model still has one rate set per class/session, not a schedule of effective-dated prices; use advance credit when future rates cannot be finalized under that model.

For advance-only collection, send `period_type: "advance_only"`, `billing_periods: []`, a positive `amount`, `credit_amount: "0.00"`, and `retain_excess_as_credit: true`. This requires a valid active enrollment, but no fee structure or obligation. To consume existing credit, specify its exact `credit_amount` against selected months; use `amount: "0.00"` and no payment method for a credit-only command.

**Allocation and integrity.** Selected obligations are paid in chronological order. Existing credit is applied first, using the oldest payment date and transaction ID; new cash follows. Earlier dues are displayed separately and remain outside allocation unless their months are explicitly selected in the same session. Prior-session dues require a separate request for their session.

For six Rs. 700 months, Rs. 2,000 pays two months fully, applies Rs. 600 to the third, and leaves three unpaid. Rs. 5,000 allocates Rs. 4,200 and retains Rs. 800 only with explicit excess-credit consent. Credit application retains references to the original cash receipt and does not add a payment or cash revenue.

Every collection acquires the organization lock first, refreshes and locks relevant metadata/financial rows, recalculates balances and quotes, and compares the preview digest. The digest is a change detector, not authorization or a substitute for server validation. Missing fees, new cash, allocations, paid/status projections, command audit, and receipt snapshot commit together. Any failure rolls back the full unit of work. The response is captured before commit; PDF rendering occurs only through the separate read endpoint.

Payment amount equals allocated amount plus derived remaining credit. Fee paid amount must equal its allocation sum and cannot exceed final amount. Phase 1 foreign keys and uniqueness constraints prevent duplicate months and mismatched tenant/student/session allocations. Aggregate balance checks remain service-enforced under locks; arbitrary privileged SQL can bypass them, so all financial writers must continue using these services. Organization-level serialization is deliberately retained and can limit write throughput for a large school.

**Receipts and reporting.** One actual payment yields one receipt. New PDFs show selected months, allocations from that payment, remaining monthly balances, total cash, payment method and the payment's remaining credit at issue. Advance-only receipts show no monthly charge. Receipt snapshots are frozen; later credit use appears in transaction history and does not rewrite the original receipt. Existing single-month PDFs continue through their old renderer. Legacy records lacking issue-time snapshots are explicitly labeled as current balances in the receipt-data API.

Dashboard cash revenue already sums `FeeTransaction` by payment date and session without allocation joins; it remains unchanged and is covered by regression tests. Applying credit does not increase it. Fee reports use Decimal arithmetic, retain existing totals as obligation totals rather than cash revenue, add future/overdue indicators, and include withdrawn students with fee history. Overdue means an outstanding obligation before the current calendar month; future obligations are not overdue. Existing vouchers retain their prepayment-only policy and period-based arrears calculation. Paid/partially paid fees use receipts and history rather than new vouchers.

**Verification.** Final runs passed **206 tests**, with no failures or skips within these selected suites:

| Suite | Passed | Evidence |
| --- | ---: | --- |
| Existing application/preflight regressions | 152 | `validation/phase2_regression_tests.log` |
| Phase 2 functional/API/report tests | 28 | `validation/phase2_functional_tests.log` |
| Existing PostgreSQL integrity/concurrency tests | 17 | `validation/phase2_postgres_regressions.log` |
| Phase 2 PostgreSQL tests | 9 | `validation/phase2_postgres_tests.log` |

PostgreSQL runs created isolated loopback clusters and synthetic schemas with SQLAlchemy metadata; their helpers stopped and removed the clusters afterward. No configured Supabase URL or original database was used for write tests. `git diff --check` passed. Synthetic partial, yearly, and advance PDFs were rendered and visually inspected; selected-month balances are shown even for months receiving zero from a partial payment. The samples are under `output/pdf/phase2-*-receipt.pdf`.

During development, tests caught a confirmation that returned 422 after a competing payment made it an overpayment; it now returns the required 409 stale-preview conflict. A shared test-fixture method collision and the old expected Alembic head were also corrected. Restricted-sandbox TestClient runs stalled and were stopped; the same synthetic suites passed outside that sandbox. Existing datetime/Pydantic deprecation warnings remain. Poppler reported unavailable optional Symbol/ArialUnicode display fonts, but the rendered Latin-text sample receipts had no visible defects; broader script/font coverage is not validated.

The 9 historical integrity migration tests and 10 Phase 1 allocation migration tests were **not executed** under the Phase 2 instruction not to run migrations automatically. Their execution is distinct from the 26 PostgreSQL tests above. The current-application compatibility case is prepared to advance through i53 before invoking Phase 2 code. Migration execution and preservation across the real DDL remain unverified, including that prepared case.

**Required migration and remaining release work.** `i53b92a4c186` follows `h42a81f3b075`; the dependency on `g31f70e2a964` remains unchanged through h42. It adds only the command table, its keys/index/security protections, and the structure's rate-confirmation flag. It does not modify payment amounts, balances, receipts, allocations, student fees or session dates. Automatic downgrade refuses to discard command history. Applied migrations were not edited.

The new application code requires i53, including the single-month endpoint's cross-operation key check. Do not deploy this code against h42 alone. After review and separate migration authorization, rehearse the full required chain on a disposable restored database, compare every original financial field/receipt and allocation total, run the historical migration suites, and check RLS/default privileges with representative roles. Review the new constraints and migration locks before a production maintenance window. Confirm future rates explicitly where appropriate; otherwise test advance-only collection.

Safe local test commands, run from `backend/`, do not execute migrations when these exact patterns are used:

```powershell
.\venv\Scripts\python.exe -B tests\run_fee_phase1_tests.py
$env:DATABASE_URL = 'sqlite://'
.\venv\Scripts\python.exe -B -m unittest discover -s tests -p test_fee_multi.py -v
& tests\run_postgres_tests.ps1 -TestPattern 'test_fee_postgres.py'
& tests\run_postgres_tests.ps1 -TestPattern 'test_fee_postgres_phase2.py'
```

Do not substitute the helper's broad default pattern while migration execution remains unauthorized. Before eventual deployment, also exercise preview/confirm/replay, a stale preview, a partial payment, advance-only cash, credit-only application, grouped/legacy receipts, and history from multiple sessions against the disposable migrated schema. Refunds/reversals, dated rate schedules, payment-gateway settlement, and the frontend remain outside this phase. Await review before migration, deployment, or Phase 3.
