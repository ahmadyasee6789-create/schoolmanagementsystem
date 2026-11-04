# i53b92a4c186 migration-readiness review

Reviewed 3 November 2026. `i53b92a4c186` was never applied to the configured Supabase database. No deployment, commit, push, frontend work, or Phase 3 work occurred.

## Result

The migration is ready for a separately approved production rehearsal and deployment procedure. It has no data backfill and does not update existing fee, payment, allocation, receipt, balance, session, or rate values. It adds a non-null `rates_finalized BOOLEAN DEFAULT false` column to `fee_structures`, creates the `fee_collection_commands` audit/idempotency table, its owner index, composite restrictive foreign keys, an idempotency uniqueness constraint, a fingerprint-length check, and RLS/privilege protections. Automatic downgrade deliberately refuses because it could discard command history.

The revision chain is single and correct:

```text
g31f70e2a964 -> h42a81f3b075 -> i53b92a4c186
```

`i53` requires `h42`, whose ownership keys on students, sessions, and transactions satisfy all composite foreign keys. The migration runs only online against PostgreSQL and sets a 10-second local lock timeout. The lock timeout was tested against a conflicting `fee_structures` lock: migration failure left the schema, data, and Alembic revision at h42 and a subsequent retry succeeded.

## Schema and access-control verification

`fee_collection_commands` has the following columns:

| Column | Contract |
| --- | --- |
| `id` | primary key and generated sequence |
| `organization_id`, `student_id`, `session_id` | non-null tenant ownership |
| `transaction_id` | nullable only for credit-only commands |
| `created_by` | non-null user reference |
| `idempotency_key` | non-null `VARCHAR(128)`, unique within organization |
| `request_fingerprint` | non-null 64-character value |
| `response_snapshot` | non-null JSON response audit |
| `created_at` | non-null timezone-aware timestamp defaulting to `now()` |

The new `ix_fee_command_owner (organization_id, student_id, session_id)` supports owner-scoped history lookups. The unique `(organization_id, idempotency_key)` constraint prevents duplicate command processing while allowing the same key in a different organization. The check rejects fingerprints other than 64 characters.

All four foreign keys use `ON DELETE RESTRICT`:

| Command fields | Parent |
| --- | --- |
| `(student_id, organization_id)` | `students (id, organization_id)` |
| `(session_id, organization_id)` | `academic_sessions (id, organization_id)` |
| `(transaction_id, organization_id, student_id, session_id)` | `fee_transactions` matching owner |
| `created_by` | `users.id` |

The table has RLS enabled and no policies. This deliberately blocks direct `anon`, `authenticated`, and untrusted-role access. `PUBLIC`, `anon`, and `authenticated` have no table or sequence privileges, including select, insert, update, delete, truncate, references, trigger, usage, or sequence select/update. RLS still denied reads, updates, deletes, and inserts after direct table grants were deliberately added to an untrusted disposable role.

This follows the Phase 1 backend-only access model. The application database role must continue to own the table or have `BYPASSRLS`; a normal non-owner role without a policy will be denied. This is an operational pre-deployment check, not a defect in the migration.

`rates_finalized` is non-null and defaults to `false`. Existing fee structures preserve their rates and enter the conservative unconfirmed state. Existing issued future fees remain collectible. Creating a missing future fee remains blocked until an administrator confirms that structure's rates; advance-only payments remain allowed.

## Disposable rehearsal

The migration was executed on PostgreSQL 18.1 in a newly created loopback-only cluster and a generated schema. The source was a representative h42 dataset with two organizations, six fees, seven payments, seven allocations, split partial payments, an unapplied credit payment, discounts, a fully paid fee, a zero-net fee, duplicate receipt/key values across organizations, and an existing fee structure for each organization.

Every original column of organizations, users, students, sessions, grades, classrooms, enrollments, structures, fees, payments, and allocations was byte-for-byte equivalent in a canonical before/after comparison. This includes receipt numbers, payment dates, idempotency keys, snapshots, ownership values, percentages, allocation timestamps, and amounts.

| Measure | Before | After |
| --- | ---:| ---:|
| Fees | 6 | 6 |
| Payments | 7 | 7 |
| Allocations | 7 | 7 |
| Billed | Rs. 5,541.19 | Rs. 5,541.19 |
| Paid / allocated | Rs. 3,546.27 | Rs. 3,546.27 |
| Outstanding | Rs. 1,994.92 | Rs. 1,994.92 |
| Cash received | Rs. 4,046.27 | Rs. 4,046.27 |
| Unapplied credit | Rs. 500.00 | Rs. 500.00 |
| Commands | absent | 0 |

The reproducible synthetic evidence, including full schema reflection and before/after fingerprints, is in `validation/phase2_migration_rehearsal.json`. It contains no Supabase credentials or real school data.

## Post-migration application checks

On the migrated synthetic schema:

- Existing single-month replay returned its original response and legacy receipts rendered.
- A new single-month payment collected and replayed safely.
- A quarterly collection generated exactly its three selected missing obligations, left existing snapshots unchanged, created one cash payment, and rendered one grouped receipt.
- A credit-only collection applied Rs. 400.00 from the two prior receipts, created allocations and one command, and created no `FeeTransaction`, receipt number, receipt URL, or new cash revenue.
- Concurrent credit consumption committed only one request; the other returned a conflict. Cash remained unchanged.
- Future missing obligations were rejected while `rates_finalized=false`, while existing obligations and advance-only payment continued to work. Setting the flag true enabled future generation.

## Test results

| Suite | Result |
| --- | ---:|
| Previously excluded historical migration tests (`g31` and `h42`) | 19 passed |
| Dedicated i53 migration rehearsal | 14 passed |
| Complete PostgreSQL readiness suite | 59 passed |

The complete suite covered h42 backfill/refusal paths, i53 schema/constraints/indexes/defaults, RLS and grants, lock timeout, injected DDL failure rollback, downgrade refusal, legacy and new single-month collections, multi-month collection, credit-only behavior, allocation/payment reconciliation, receipts, and concurrent credit consumption. All test clusters were stopped and removed after completion. `git diff --check` passed.

One test assertion was corrected during validation: PostgreSQL reflection displays the timestamp type string as `TIMESTAMP`, while its reflected `timezone` flag is true. The test now checks that flag directly. No migration code was changed and no migration defect was found.

## Remaining deployment conditions

1. Confirm the production backend role is the table owner or has `BYPASSRLS` before applying the migration.
2. Back up the production database and record its current Alembic revision. The intended predecessor is `h42a81f3b075`.
3. Stop financial writers or use a maintenance window. The migration needs an exclusive table lock and fails after ten seconds rather than waiting indefinitely.
4. Apply the database migration before deploying application code that imports `FeeCollectionCommand`. The current single-month endpoint fails closed, without financial writes, if the application is deployed before i53.
5. After migration, explicitly confirm future rates in each fee structure where on-demand future fee generation is intended. The default is `false` for safety.
6. Run the same pre/post reconciliation and representative API smoke tests on a disposable restoration before authorizing production execution.

Do not automatically downgrade i53. Use an approved recovery procedure if rollback is required.
