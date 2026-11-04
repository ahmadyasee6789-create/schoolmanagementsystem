**Phase 1 implementation review — 3 November 2026.** Backend architecture is implemented locally. No migration, database reset, production deployment, frontend change, commit, or push was performed. New collection endpoints and grouped receipts remain Phase 2 work.

**Deployment is currently blocked by two legacy billing periods.** The configured PostgreSQL database was inspected in a transaction with `transaction_read_only = on`. Its Alembic revision is `g31f70e2a964`. The monthly uniqueness constraint, receipt/idempotency uniqueness constraints, and restrictive history foreign keys match the predecessor migration. The read-only preflight rejects these records:

| StudentFee ID | Organization | Student | Session | Stored month | Session dates | Enrollment date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | April | 2026-04-14 through 2027-04-14 | 2026-04-14 |
| 2 | 3 | 2 | 4 | April | 2026-04-19 through 2027-04-19 | 2026-05-19 |

Both sessions overlap April in two different calendar years. The implementation does not choose a year using today's date, receipt dates, row ordering, or a session name. For fee 2, April 2026 also precedes its enrollment date. Although that makes April 2027 the only enrollment-compatible candidate, the migration deliberately requires a unique session-level mapping and does not reinterpret an existing charge using potentially incorrect enrollment metadata.

Required resolution: a school administrator must verify the intended billing year and actual session/enrollment dates from admission records and original fee documents. If dates are wrong, prepare a separately reviewed metadata correction, without changing charge amounts, discounts, payment amounts, receipt references, or balances. If both April boundaries are intentional, a separately reviewed, record-specific year mapping is required; this revision has no silent override mechanism. A mapping to April 2026 for fee 2 cannot pass enrollment validation without resolving its enrollment-date discrepancy. Neither record was changed. No other issue was returned by this preflight, but it must be repeated after any reviewed correction and immediately before migration.

**Files created.** Paths below are relative to `backend/`.

| File | Purpose |
| --- | --- |
| `app/models/fee_allocation.py` | Payment-to-obligation allocations and tenant/student/session constraints |
| `app/services/billing_periods.py` | First-of-month identity, session/enrollment validation, legacy month resolution |
| `app/services/monthly_fees.py` | Shared monthly calculations and idempotent charge creation |
| `app/services/fee_allocations.py` | Allocation writes, reconciliation, derived credit |
| `app/services/fee_amounts.py` | Existing exact-money validator extracted without rounding changes |
| `app/services/fee_locks.py` | Existing organization-first financial lock extracted for reuse |
| `app/db/fee_migration_v1.py` | Frozen read-only backfill preparation and review CLI |
| `app/db/fee_allocation_security_v1.py` | Frozen PostgreSQL RLS and public-role privilege protection |
| `alembic/versions/h42a81f3b075_fee_allocations.py` | Unexecuted schema/backfill migration |
| `tests/test_fee_architecture.py` | Period, calculation, allocation, rollback, receipt and cash-report regressions |
| `tests/test_fee_backfill_preparation.py` | Invalid historical-data checks against isolated predecessor-shaped tables |
| `tests/run_fee_phase1_tests.py` | Safe regression runner that excludes migration execution |
| `PHASE1_MULTI_MONTH_FEES.md` | This report and operator handoff |

**Files modified.**

| File | Change |
| --- | --- |
| `app/models/student_fee.py` | Billing period and allocation relationships/constraints |
| `app/models/fee_transection.py` | Payment ownership, optional legacy pointer, fingerprint and response snapshot |
| `app/models/students.py` | Composite candidate key for tenant-safe financial references |
| `app/models/academic_session.py` | Composite candidate key for tenant-safe financial references |
| `app/models/__init__.py` | Register FeeAllocation |
| `app/services/fee_collection.py` | Existing single-fee endpoint writes one allocation atomically |
| `app/routers/student_fee.py` | Reuse monthly service; explicit receipt joins; period-aware ledger filtering |
| `app/routers/fee_voucher.py` | Compare real periods for arrears; reject ambiguous month-name filters |
| `app/routers/reports.py` | Resolve legacy month filters to a unique period |
| `app/routers/dashboard.py` | Sum each payment once by its explicit session ownership |
| `app/crud/student.py` | Protect students with advance-only payment history from deletion |
| `tests/test_fee_integrity.py` | Give fixtures explicit billing/enrollment dates |
| `tests/test_fee_postgres.py` | Update fixtures and add real PostgreSQL allocation/generation races |
| `tests/test_fee_voucher.py` | Give fixtures correctly mapped periods |
| `tests/test_financial_permissions.py` | Reconciled payment/allocation fixtures |
| `tests/test_fee_postgres_migration.py` | Keep the historical g31 exact-cent test independent of the newer ORM; this suite was not run |

Tracked bytecode is not an implementation artifact. Incidental bytecode changes were cleaned up except the dashboard bytecode path that was already dirty before this work; it was not reset to HEAD.

**Model and schema changes.** `FeeStructure` is unchanged: one structure per organization/class/session, with tuition, admission and exam rates. `StudentFee` retains its month label and every existing financial snapshot. Its new required `billing_period DATE` must be the first day of a month. `uq_student_fee_billing_period` uses `(organization_id, student_id, session_id, billing_period)` and replaces the old month-name uniqueness rule. Class is intentionally excluded, just as before: a class transfer must not create a second monthly tuition obligation for the same student/session. Explicit dates allow the same month name in different years within a longer session.

`FeeAllocation` has an integer ID, organization/student/session ownership, transaction ID, StudentFee ID, `NUMERIC(14,2)` amount, and a timezone-aware database-created timestamp. Positive finite amounts are bounded at 999999999999.99. Composite foreign keys require both parents to match the allocation's organization, student and session, with `ON DELETE RESTRICT`. Indexes support payment, obligation and owner lookups. Multiple allocation events may reference the same payment/obligation when credit is applied in installments; each row records an application event. The service appends rows and does not edit or remove prior events.

`FeeTransaction` remains the cash-receipt record. Its existing ID, amount, payment date, receipt number, created_by, idempotency key, paid_amount_after and fee_status_after are retained. It gains required student/session ownership, a nullable SHA-256 request fingerprint, and a nullable JSON response snapshot. The legacy `student_fee_id` remains populated for old transactions and the existing single-fee endpoint, but becomes nullable for future unallocated or multi-month payments. Its composite history FK still protects the legacy fee relationship. Receipt uniqueness and organization-scoped idempotency uniqueness are unchanged. The snapshot check continues enforcing old single-fee snapshots and permits a future non-single-fee keyed payment only with a fingerprint and response snapshot.

No new stored credit balance is introduced. For a payment `t` and an obligation `f`:

```text
remaining_credit(t) = t.amount - SUM(allocations for t)
t.amount = SUM(allocations for t) + remaining_credit(t)
f.paid_amount = SUM(allocations for f)
0 <= f.paid_amount <= f.final_amount
remaining_credit(t) >= 0
```

Allocations are authoritative for applied amounts; the existing `paid_amount` column is a maintained projection for legacy readers. Collection refuses to proceed if this projection differs from the allocation sum. It does not repair a discrepancy automatically. Cash reports sum `FeeTransaction.amount` once and never sum or join allocation rows into cash revenue. The dashboard's legacy `revenue` label continues to mean cash collected, including unapplied credit; this is not a new accrual/revenue-recognition policy.

**Enforcement boundaries.** The live read-only privilege check confirmed that both existing fee tables have RLS enabled, the backend role has BYPASSRLS, and Supabase default grants include anon/authenticated roles. The new allocation table enables RLS without public policies and revokes table/sequence privileges from PUBLIC and, when present, anon/authenticated, including privileges such as TRUNCATE that RLS does not govern. This protection is included in both the unexecuted migration and isolated PostgreSQL metadata creation. Backend access requires the intended owner/BYPASSRLS role; application tenant checks remain mandatory.

Database constraints enforce monthly uniqueness, first-day normalization, money bounds, the fee's paid-versus-final cap, matching allocation/payment/fee ownership, receipt/key uniqueness, and restrictive parent deletion. Aggregate reconciliation and prevention of credit overspending are enforced by the shared write service under organization-first, payment and obligation row locks, with refreshed ORM state. They are not cross-table PostgreSQL CHECK constraints or deferred triggers. Direct SQL, manually editing ORM records outside these services, or deleting allocation rows can bypass the aggregate checks. Production application writers must use these services and database access must remain restricted. This phase does not claim a tamper-proof journal or implement reversals/refunds.

**Shared calculation and generation behavior.** Tuition-only percentage discounts still use Decimal and ROUND_HALF_UP once per month. Admission remains charged on the first newly generated obligation with a positive admission charge in that student's session, even if a later month was generated first; this preserves the original policy. Exam charges remain optional per generated month. Existing obligations return unchanged, including after rates or concessions change. Explicit flushes ensure later months in a transaction see an earlier admission charge when SQLAlchemy autoflush is disabled, as in production.

New obligations require an organization-owned student/session, a valid active enrollment, its organization-owned classroom/grade and matching session structure. Billing uses calendar-month overlap: there must be at least one common day in the billing month, academic session and enrollment interval. Partial calendar months are not prorated. Withdrawal is inclusive. Future months are still allowed when they pass these checks; no scheduler, blanket future generation, automatic credit application, or new collection API was added. A class-generation request that encounters an ineligible student fails atomically rather than creating an incomplete class batch.

The old month-name API remains usable when a month has a unique year in the session. Generation and ledger/report filters reject ambiguous input; bulk vouchers also reject it. A single voucher uses its stored period, with previous dues ordered by date. Phase 2 must expose explicit periods for sessions whose labels repeat. The school must approve how mid-month session boundaries are billed before resolving the two legacy records above.

**Existing one-payment/one-fee assumptions and their disposition.**

| Location | Disposition |
| --- | --- |
| FeeTransaction.student_fee_id and StudentFee.transactions | Kept as legacy compatibility relationships; allocation relationships now express payment application |
| Collection reconciliation that previously summed transactions by student_fee_id | Replaced by sums of allocations; old endpoint writes one allocation |
| payment_response and single-fee idempotent replay | Original response contract retained; new snapshots/fingerprints persisted; old nullable snapshots still supported |
| Receipt endpoint and receptTemp renderer | Still intentionally single-fee, with explicit joins and existing printable output; grouped/credit receipts belong to Phase 2 |
| Dashboard transaction-to-fee join | Removed; payment ownership supports one cash count including unapplied money |
| Fee ledger, vouchers and fee reports | Continue using the reconciled fee projection; date ordering/filtering replaces ambiguous month ordering |
| Student history deletion guard | Extended to include payments that have no obligation yet |
| Historical g31 migration/preflight and tests | Frozen old-schema assumptions retained; old migration test no longer calls the new-schema service |
| Next.js single-fee collection/pending request | Inspected, unchanged; no new UI or API contracts introduced |

The current collection endpoint still requires its existing Idempotency-Key, accepts exactly the same amount payload, rejects payments above that one fee's balance, returns the same response keys/types, and renders PDFs separately. New keys use a versioned hash of operation, fee ID and canonical amount. Response snapshots include only the existing payment response fields; no names, auth headers, tokens or full requests are stored. Legacy transactions without these new fields use the original replay data. Remaining credit is an architectural capability, not a newly enabled public payment mode.

**Migration revision and strategy.** The verified source chain is:

```text
d7c3f22d287b -> e41b62a901df -> f8a29d10c6b4 -> g31f70e2a964 -> h42a81f3b075
```

The new revision takes explicit locks with a 10-second lock timeout and checks the predecessor constraint definitions. Before DDL it validates original money/precision, breakdowns, statuses, balances, ownership, receipt/key uniqueness, dated enrollments, and unique session-derived billing years. Errors identify affected table names and IDs without disclosing personal fields. `app/db/fee_migration_v1.py` and `app/db/fee_allocation_security_v1.py` are frozen migration helpers and must remain available unchanged after release.

After a clean preflight, the revision adds and backfills billing periods and explicit payment ownership, creates allocation structures, and inserts exactly one allocation for each verified existing transaction, using the original transaction-to-fee relationship and original amount. Allocation `created_at` is the backfill time, not an invented historical payment timestamp; the original payment_date remains intact. It does not modify historical financial values or invent missing payments. Legacy fingerprint/JSON snapshots remain NULL. Post-backfill validation verifies one matching allocation per legacy transaction, exact amount and ownership equality, and each obligation's allocation total versus its stored paid amount. A failure aborts the transaction, including PostgreSQL DDL. Automatic downgrade raises an error to protect allocation history.

**Compatibility and cutover.** This requires coordinated backend/schema deployment. Old writers lack billing periods, payment ownership and allocation writes, and therefore must not run after migration. The new ORM must not serve requests against the g31 schema. Keep financial operations unavailable throughout the cutover, drain active requests, and stop all old backend workers and other financial writers. The frontend's existing single-fee flow can continue after the matching backend/schema is enabled. Do not roll back only the application binary to the old writer after new transactions have been accepted.

**Verification performed.**

| Suite/check | Passed | Failed | Skipped in executed suite |
| --- | ---: | ---: | ---: |
| Existing auth security | 15 | 0 | 0 |
| Existing fee integrity/API compatibility | 22 | 0 | 0 |
| New period/allocation architecture | 21 | 0 | 0 |
| New read-only migration preparation | 14 | 0 | 0 |
| Existing voucher regressions | 23 | 0 | 0 |
| Existing financial permissions | 23 | 0 | 0 |
| Existing student details | 12 | 0 | 0 |
| Existing student import | 22 | 0 | 0 |
| PostgreSQL constraints, RLS and concurrency | 17 | 0 | 0 |
| Total | 169 | 0 | 0 |

The nine historical migration-execution tests were deliberately excluded, not executed against any database. The new migration's upgrade/downgrade functions were not executed either. Tests use synthetic in-memory SQLite or a separate disposable loopback PostgreSQL cluster, with schema creation from SQLAlchemy metadata. The PostgreSQL helper stopped and removed its test cluster. Tests cover identical/conflicting keys, overlapping partial payments, overpayment races, double-spending advance credit, concurrent generation, allocation-insert rollback, composite ownership constraints, exact amounts, historical receipts, cash totals without duplicate counts, and denial of untrusted reads/writes even when a role receives table grants. Python syntax, PostgreSQL model DDL compilation, and diff whitespace checks passed. Existing Pydantic orm_mode and datetime.utcnow deprecation warnings remain.

Reproduce from the backend directory; these commands do not execute migrations:

```powershell
.\venv\Scripts\python.exe -B tests\run_fee_phase1_tests.py
.\tests\run_postgres_tests.ps1 -Port 55443 -TestPattern 'test_fee_postgres.py'
```

**Required steps before any migration execution.**

1. Resolve the two listed billing-year/date conflicts from school records. Review and approve any separate metadata correction or explicit mapping design. Preserve all financial snapshots and record the evidence; do not infer a year to make the preflight pass.
2. Confirm the intended database is at g31f70e2a964, the complete new source and frozen migration helper are packaged, and no schema drift changes the inspected constraints. Verify Supabase access controls for the new allocation table: do not expose financial tables through public/anonymous API roles; retain tenant-scoped backend access.
3. Take a consistent backup and prove it can be restored into a separate database. Capture schema revision, row counts, original payment IDs/amounts/receipt numbers/keys, and per-obligation paid balances for comparison. Store backup material and credentials securely, outside repository artifacts.
4. Set `FEE_MIGRATION_REVIEW_URL` through the approved secret mechanism to the intended review database, then run `.\venv\Scripts\python.exe -B -m app.db.fee_migration_v1`. It does not read the application .env and forces a PostgreSQL READ ONLY transaction. Save its ID-only diagnostics. The current source/database combination will refuse until the listed conflicts are resolved.
5. Obtain separate authorization to execute the migration on the restored staging copy. That full DDL/backfill rehearsal has not been performed under this task's no-migration instruction. Compare original financial fields and IDs before/after, check all allocation sums, and exercise legacy collection/replay/receipt, reporting and deletion protection.
6. Review the staged result and recovery plan. Schedule a maintenance window, disable financial traffic, stop all writers, drain open transactions, take the final backup and repeat the read-only checks.
7. Only after explicit migration approval, an operator can apply the reviewed revision h42a81f3b075 to the verified target and start the matching backend. No migration execution command was run in this task. Keep traffic closed until version, counts, invariants, existing receipts, idempotent replay and tenant boundaries have been verified.

**Recovery procedure.** If preflight or the transactional upgrade fails, leave writers stopped, verify the schema revision and original financial values remain at the predecessor state, and diagnose the reported IDs; do not repair or retry blindly. If migration committed but no new activity has occurred, restore the verified pre-migration backup and matching old backend only under an approved recovery operation. If any post-migration activity occurred, preserve a complete post-migration backup and audit extract first, then use a reviewed forward fix or reconciliation/replay recovery. Restoring an older backup without accounting for new receipts would lose financial records. Automated downgrade, dropping allocations, or restoring only selected financial tables is not a supported rollback.

**Remaining design decisions and Phase 2 foundation.** The immediate blocker is the school-specific treatment of session boundary months and the two historical dates. The full migration still needs a separately authorized staging rehearsal. Aggregate integrity assumes all application financial writes use the locking/reconciliation services; arbitrary direct SQL is outside this guarantee. Org-wide financial locking intentionally trades throughput for simple correctness. Admission timing remains generation-order based, and date overlap bills a full month. Refunds, reversals, cross-session credit transfers, arbitrary fee-head configuration and an immutable accounting journal are not implemented.

After the migration is reviewed and successfully rehearsed, Phase 2 can build explicit student/session/year-month selection, 1/3/6/12/custom presets, previews, allocation policies, advance-credit application, grouped receipts and student fee history on these models and services. Any new collection or credit-application endpoint must define a versioned canonical request fingerprint, stable idempotent response, deterministic allocation order, and one transaction covering all charges, payment/credit use and balance projections. This phase intentionally exposes none of those new public workflows.
