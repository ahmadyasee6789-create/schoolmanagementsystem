# Phase 1: security and financial integrity

Completed in the existing application on 25 October 2026. No Supabase connection, production migration, production secret provisioning, or deployment was performed. Existing unrelated workspace changes were preserved.

## Bugs fixed

| Area | Result |
| --- | --- |
| JWT configuration | Signing and verification share mandatory `SECRET_KEY` and HS256 configuration. Startup rejects missing, short, or obvious placeholder keys. Access/refresh token types, expiry, positive user IDs, and active users are checked. Permissions use current database membership. |
| Financial permissions | Backend checks protect generation, collection, structures, vouchers, receipts, financial reports, payroll, and expenses. Dashboard finance fields are redacted for other roles, including cached responses. Invitation tokens are admin-only so ordinary staff cannot obtain role-granting invitation links. |
| Duplicate submissions | Successful payments store an organization-scoped idempotency key and original response snapshot. Retrying the same fee/amount/key returns that payment; reusing a key for another payment returns 409. |
| Concurrent collections | Collection locks the organization and then the fee, refreshes the balance, validates transaction reconciliation, and writes the balance and transaction atomically. Receipt references remain unique. Generation uses the same organization lock plus a unique student/session/month constraint. |
| History preservation | Student deletion returns 409 when any fee history exists. ORM cascades no longer delete fees or transactions; restrictive foreign keys also block direct parent deletion. Mark the student inactive instead. |
| Amount validation | Discounts must be finite, 0–100 inclusive, with at most two decimal places. Payments must be positive finite currency amounts; structures cannot be negative. Fee amounts use exact `NUMERIC(14,2)` and discounts `NUMERIC(5,2)`. Percentage discounts are rounded once to cents using half-up rounding. Salary/expense requests reject invalid amounts and salary payouts reject invalid net totals. |
| Tenant relationships | Fee-structure creation and update validate the classroom, grade, session, and classroom/session match in the current organization. Generation checks these relationships too. Enrollment sessions and expense categories are organization-scoped. |
| PDF failure isolation | Payment confirmation performs no PDF work. A separate authenticated receipt GET renders in memory. Rendering failure returns 503 from that GET without changing the recorded payment. |

The existing enroll-student endpoint also now commits its transaction and accepts its advertised roll-number argument. These small repairs were necessary to exercise discount permissions through the real endpoint.

## Permission matrix

| Operation | Admin | Manager | Accountant | Other roles |
| --- | --- | --- | --- | --- |
| Read fees, reports, vouchers, receipts | Yes | Yes | Yes | Denied |
| Generate and collect fees | Yes | Yes | Yes | Denied |
| Grant a nonzero enrollment discount | Yes | Yes | No | Denied |
| Create, update, delete fee structures | Yes | No | No | Denied |
| Payroll and expenses endpoints | Yes | Yes | Yes | Denied |
| List role-granting invitation tokens | Yes | No | No | Denied |

Existing student write roles may still enroll a student with a zero discount. Student roster discount visibility was preserved; access to roster data is separate from fee-ledger access.

## API and client compatibility

- Existing fee-generation, ledger, and collection URLs remain unchanged.
- `POST /fees/{fee_id}/collect` now **requires `Idempotency-Key`**: 8–128 ASCII letters, digits, hyphen, underscore, period, or colon. Missing/invalid keys return 422. Other clients must be updated before enabling collection.
- Existing integer amounts remain accepted; decimal JSON numbers or strings with at most two decimal places are accepted too.
- The response retains `fee_id`, `receipt_no`, `status`, `paid_amount`, and `receipt_pdf`. `receipt_pdf` is now `null`; added fields are `transaction_id` and `receipt_url`. Fetch the URL with authentication to download the receipt.
- `GET /fees/payments/{transaction_id}/receipt` works without an active-session dependency and is tenant-scoped. Legacy receipts have no invented historical balance/status snapshot.
- An uncertain payment response must be retried with **the original key and amount**. A successful replay returns the original balance/status snapshot, even if later payments exist. Refresh the ledger to see the latest balance.
- The existing fee page persists the pending request before POST, blocks duplicate clicks, and retains its key across timeout, retry, and page refresh. Its retry banner remains available even if the ledger is already paid. No frontend layout redesign was introduced.
- Old typeless JWTs and tokens signed with the removed fallback key are invalid; affected users must sign in again.

## Migration created

`alembic/versions/g31f70e2a964_fee_integrity.py`, revision `g31f70e2a964`, follows the existing `f8a29d10c6b4` revision.

It adds nullable idempotency/snapshot fields for legacy compatibility, uniqueness for payment keys and billing periods, restrictive history foreign keys, amount/discount/balance checks, and exact currency column types. It leaves legacy transaction keys and snapshots null and does not fabricate historical transactions.

Before DDL, an online PostgreSQL preflight checks duplicate charges, invalid amounts/precision/discounts, inconsistent breakdowns, paid balances versus transaction totals, and relevant tenant mismatches. Any issue raises an error with counts and rolls back the migration. It never deletes duplicates, rounds old values, resets balances, or changes ownership automatically. Some old records may therefore require an explicitly reviewed reconciliation before upgrade.

The upgrade takes exclusive locks on the affected financial tables with a 10-second lock timeout. Schedule a maintenance window with writers stopped. Automatic downgrade is deliberately disabled: dropping payment keys or converting cents back to integers can destroy financial integrity. Any rollback requires a compatible application/schema plan and reconciliation of payments recorded since backup.

## Deployment steps — not executed

1. Verify a restorable backup and inspect the deployment's current Alembic revision. Test the upgrade on a staging copy, including any legacy-data reconciliation it requests.
2. Provision a securely generated production `SECRET_KEY` through your deployment secret configuration. It must be at least 32 bytes and must not be a placeholder. No secret was generated, embedded in application code, or written to an environment file by this change.
3. Stop financial writers. Apply the reviewed migration explicitly to the intended database only after the staging result is accepted. Review the full revision chain if the deployment precedes `f8a29d10c6b4`.
4. Deploy the matching backend and updated payment client together. Keep collection unavailable to clients that cannot send a stable idempotency key.
5. Verify sign-in, the role matrix, one payment and same-key replay, receipt download, and history-protected student deletion in the deployment environment. Reopen financial operations only after validation.

## Test results

Full backend run: **138 passed, 0 failed, 0 skipped**, using synthetic SQLite data and an isolated local PostgreSQL 18 cluster. The helper stopped and removed its cluster afterwards.

| Suite | Passed |
| --- | ---: |
| Authentication/configuration | 15 |
| Fee application/HTTP integrity | 22 |
| PostgreSQL concurrency and target guards | 12 |
| Actual historical Alembic upgrades and preflight rollback | 9 |
| Financial permissions, ownership, discounts, deletion | 23 |
| Existing voucher regression suite | 23 |
| Existing student-details regression suite | 12 |
| Existing student-import regression suite | 22 |

Real PostgreSQL cases cover simultaneous identical and conflicting keys, two accountants using stale cached balances, overpayment races, distinct-fee receipt collisions, duplicate billing-period insertion, insert failure rollback, and stable replay snapshots. Migration tests run the actual older revisions, verify value preservation, reject invalid historical rows without alteration, verify restrictive deletion and NaN rejection, and verify downgrade refusal.

Reproduce the full backend run from the backend directory:

```powershell
.\tests\run_postgres_tests.ps1 -Port 55443 -TestPattern 'test_*.py'
```

The helper uses installed PostgreSQL binaries and creates a unique local cluster/database. It never uses the application database URL. Direct PostgreSQL tests require an explicit `TEST_POSTGRES_URL` with a literal loopback address, an `sms_fee_test_` database name, and no query parameters. Without it, the PostgreSQL cases intentionally skip. Windows sandbox socket restrictions required an approved local execution outside the sandbox; this was not a test failure.

The fee page passed ESLint, TypeScript checking with import-extension compatibility enabled, and seven ad hoc payment-intent scenarios (duplicate clicks, exact amounts, fresh keys, lost responses, original-amount retry, reload recovery, and invalid precision). Git diff whitespace checks passed. Existing Pydantic and datetime deprecation warnings remain.

**Failed check:** standard frontend `tsc --noEmit --incremental false` exits 1 with four pre-existing TS5097 errors. Each is an explicit `.ts` import at line 4 in `components/employees/DeleteEmployeeDialog.tsx`, `Employeecard.tsx`, `Employeeformdialog.tsx`, or `Employeetoolbar.tsx`. These employee files and TypeScript configuration were not changed in this phase. The compatibility check `tsc --noEmit --allowImportingTsExtensions` passes, but it does not resolve the standard-check failure. No backend tests failed, and the fee-management page produced no TypeScript diagnostics.

## Remaining risks and boundaries

- These changes are not deployed. Production data and Supabase-specific configuration were not inspected or modified; staging migration and deployment validation remain necessary.
- An old invalid ledger stops migration/collection until explicitly reconciled. This phase intentionally provides no automatic financial-data repair.
- Idempotency identifies a request, not physical cash. Distinct keys represent distinct payment intents. Closing a browser tab can lose its session storage; keep an uncertain payment tab open and reconcile before entering a fresh payment. Another tab/accountant may submit another valid intent, but concurrent collections cannot exceed the balance.
- Financial writes serialize per organization, and receipt allocation scans current-year receipt references. High-volume performance may require a dedicated receipt counter later.
- Direct database administrators or alternative database writers are outside backend role/idempotency enforcement. Restrictive parent foreign keys are not an immutable journal or a substitute for database access controls.
- Refunds/reversals, a full immutable accounting audit trail, billing-year/month redesign, cross-session arrears, and broader historical reporting are not implemented here. Dynamic fee types, quarterly collection, and unrelated frontend redesigns were excluded.
- Refresh-token revocation/rotation storage, multi-organization selection, broader promotion authorization, and student-roster concession privacy remain separate work. The existing older payroll report references undefined `TeacherSalary`; payroll workflow concurrency was not redesigned in this fee-module phase.

## Files changed in this phase

This manifest excludes unrelated changes already present in the workspace. Some listed files already contained user changes; those were preserved.

### Authentication and permissions

- [app/security.py](<D:/Projects/School Managment System/backend/app/security.py>) (new)
- [app/utils/hash.py](<D:/Projects/School Managment System/backend/app/utils/hash.py>)
- [app/routers/auth.py](<D:/Projects/School Managment System/backend/app/routers/auth.py>)
- [app/main.py](<D:/Projects/School Managment System/backend/app/main.py>)
- [app/db/session.py](<D:/Projects/School Managment System/backend/app/db/session.py>)
- [app/financial_permissions.py](<D:/Projects/School Managment System/backend/app/financial_permissions.py>) (new)
- [app/routers/organizationInvite.py](<D:/Projects/School Managment System/backend/app/routers/organizationInvite.py>)

### Fee collection, structure, receipt, and financial read guards

- [app/services/fee_collection.py](<D:/Projects/School Managment System/backend/app/services/fee_collection.py>) (new)
- [app/routers/student_fee.py](<D:/Projects/School Managment System/backend/app/routers/student_fee.py>)
- [app/routers/fee_structure.py](<D:/Projects/School Managment System/backend/app/routers/fee_structure.py>)
- [app/routers/receptTemp.py](<D:/Projects/School Managment System/backend/app/routers/receptTemp.py>)
- [app/routers/fee_voucher.py](<D:/Projects/School Managment System/backend/app/routers/fee_voucher.py>)
- [app/routers/dashboard.py](<D:/Projects/School Managment System/backend/app/routers/dashboard.py>)
- [app/routers/reports.py](<D:/Projects/School Managment System/backend/app/routers/reports.py>)
- [app/routers/payroll.py](<D:/Projects/School Managment System/backend/app/routers/payroll.py>)
- [app/routers/expenses.py](<D:/Projects/School Managment System/backend/app/routers/expenses.py>)
- [app/schemas/student_fee.py](<D:/Projects/School Managment System/backend/app/schemas/student_fee.py>)
- [app/schemas/fee_structure.py](<D:/Projects/School Managment System/backend/app/schemas/fee_structure.py>)
- [app/schemas/payroll.py](<D:/Projects/School Managment System/backend/app/schemas/payroll.py>)
- [app/schemas/expenses.py](<D:/Projects/School Managment System/backend/app/schemas/expenses.py>)

### Data models and student history

- [app/models/student_fee.py](<D:/Projects/School Managment System/backend/app/models/student_fee.py>)
- [app/models/fee_transection.py](<D:/Projects/School Managment System/backend/app/models/fee_transection.py>) (existing filename retained)
- [app/models/fee_structure.py](<D:/Projects/School Managment System/backend/app/models/fee_structure.py>)
- [app/models/student_enrollment.py](<D:/Projects/School Managment System/backend/app/models/student_enrollment.py>)
- [app/models/students.py](<D:/Projects/School Managment System/backend/app/models/students.py>)
- [app/crud/student.py](<D:/Projects/School Managment System/backend/app/crud/student.py>)
- [app/routers/students.py](<D:/Projects/School Managment System/backend/app/routers/students.py>)
- [app/schemas/student.py](<D:/Projects/School Managment System/backend/app/schemas/student.py>)
- [alembic/versions/g31f70e2a964_fee_integrity.py](<D:/Projects/School Managment System/backend/alembic/versions/g31f70e2a964_fee_integrity.py>) (new)

### Client, tests, and handoff

- [../sms-frontend/app/(dashboard)/finance/fee-management/page.tsx](<D:/Projects/School Managment System/sms-frontend/app/(dashboard)/finance/fee-management/page.tsx>)
- [tests/test_auth_security.py](<D:/Projects/School Managment System/backend/tests/test_auth_security.py>) (new)
- [tests/test_fee_integrity.py](<D:/Projects/School Managment System/backend/tests/test_fee_integrity.py>) (new)
- [tests/test_financial_permissions.py](<D:/Projects/School Managment System/backend/tests/test_financial_permissions.py>) (new)
- [tests/test_fee_postgres.py](<D:/Projects/School Managment System/backend/tests/test_fee_postgres.py>) (new)
- [tests/test_fee_postgres_migration.py](<D:/Projects/School Managment System/backend/tests/test_fee_postgres_migration.py>) (new)
- [tests/run_postgres_tests.ps1](<D:/Projects/School Managment System/backend/tests/run_postgres_tests.ps1>) (new)
- [tests/test_fee_voucher.py](<D:/Projects/School Managment System/backend/tests/test_fee_voucher.py>) (updated synthetic fixtures for the enforced constraints)
- [PHASE1_FINANCIAL_INTEGRITY.md](<D:/Projects/School Managment System/backend/PHASE1_FINANCIAL_INTEGRITY.md>) (new)

Backend paths above are relative to `D:/Projects/School Managment System/backend`.
