# Controlled production procedure: i53b92a4c186

Prepared 3 November 2026. This is a pre-execution checklist only. It does not authorize or perform an Alembic upgrade, production write, deployment, commit, or push.

## Verified production facts

The configured target was queried in a forced read-only transaction:

| Item | Observed value |
| --- | --- |
| Supabase endpoint | `aws-1-ap-southeast-2.pooler.supabase.com:6543` |
| Database | `postgres` |
| Connected role | `postgres` |
| Server | PostgreSQL 17.6 |
| Current Alembic revision | `h42a81f3b075` |
| Intended target revision | `i53b92a4c186` |
| Current role RLS capability | table owner, `BYPASSRLS`, read/write and schema-create capability |

The configured endpoint is Supabase's pooled port (`6543`). Use the Supabase dashboard's **Direct Connection** URI for the one-off migration command, rather than the pooled application URL. Keep the pooler URL for normal application traffic. This avoids transaction-pooler behavior during DDL and locking.

Current financial baseline, captured read-only:

| Measure | Value |
| --- | ---:|
| `student_fees` | 54 |
| `fee_transactions` | 0 |
| `fee_allocations` | 0 |
| Receipt rows | 0 |
| Fee structures | 6 |
| Billed | Rs. 37,800.00 |
| Paid projection | Rs. 0.00 |
| Outstanding | Rs. 37,800.00 |
| Cash / allocated / credit | Rs. 0.00 / Rs. 0.00 / Rs. 0.00 |
| Bad paid projections / overallocated payments / owner mismatches | 0 / 0 / 0 |

The baseline fingerprints are `student_fees=4d41fdaeb6f5bbcc6a12b9f117205895`, `fee_transactions=d41d8cd98f00b204e9800998ecf8427e`, `fee_allocations=d41d8cd98f00b204e9800998ecf8427e`, and `fee_structures=b05d66047d8985783f913375dd23e141`. Recalculate them immediately before and after the approved migration.

## Writer inventory and maintenance gate

The repository defines one Railway process only:

```text
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

It contains no worker, Celery, scheduler, cron, or database-migration process definition. The Railway CLI is installed locally, but it has no valid session or linked project, so live service replica count and deployment state could not be confirmed here.

Database-side inspection found no fee-related triggers or RLS policies. `anon` and `authenticated` have grants on legacy `student_fees`, `fee_transactions`, and `fee_structures`, but have no `BYPASSRLS`; RLS is enabled and no policy permits them, so they should not be able to write through PostgREST. `service_role` has write grants and `BYPASSRLS`; `postgres` is the backend/migration role and also has `BYPASSRLS`. Treat both as financial-writer paths. Fee-related database functions and `pg_cron` jobs could not be enumerated with this role, so the Supabase dashboard job list must be checked manually.

Before migration, an operator must complete every item below:

- [ ] Record the Railway project/service name and confirm all running backend replicas, preview deployments, workers, scheduled jobs, scripts, and human SQL consoles that use the production URL.
- [ ] Enable a maintenance response or otherwise block fee collection, generation, fee-structure edits, imports that can create enrollments, and direct service-role access.
- [ ] Stop or scale down every identified writer; drain in-flight requests and confirm no active application transactions remain.
- [ ] In Supabase, inspect Cron, Edge Functions, Database Webhooks, and service-role credential consumers; disable or pause anything that could write fees.
- [ ] Retain read-only access for final validation only.

## Backup and restoration gate

The database connection cannot prove that a managed Supabase backup exists or that it has been restored successfully. No repository artifact provides that evidence. This remains an approval blocker until an operator supplies it from Supabase.

- [ ] Record the latest successful production backup timestamp, retention policy, Supabase project, and backup identifier/snapshot.
- [ ] Restore that exact backup to a separate disposable Supabase project or database.
- [ ] On the restoration, verify its Alembic revision, the baseline counts/totals/fingerprints above, then run `i53b92a4c186` with the direct connection URI.
- [ ] Confirm the restoration preserves all original financial rows and passes the single-month, multi-month, and credit-only smoke tests.
- [ ] Record the restore result, operator, timestamp, and evidence location outside the repository.

The local PostgreSQL rehearsal and 59-test suite are strong migration evidence, but they do not replace a restoration test of the actual production backup.

## Database role and RLS gate

The current backend/migration role satisfies the required permissions: it owns the financial tables, can create the command table and index, and bypasses RLS. `i53` enables RLS for `fee_collection_commands`, creates no policies, and revokes table/sequence privileges from `PUBLIC`, `anon`, and `authenticated`. This is correct for the backend-only model.

Before execution:

- [ ] Re-run the read-only role check using the exact direct migration URI.
- [ ] Confirm the backend continues to connect as the owner/BYPASSRLS role after deployment.
- [ ] Confirm no client uses `service_role` for fee writes during or after the cutover unless it is an explicitly approved backend path.
- [ ] Confirm `anon`/`authenticated` are denied access to the new table and that no unintended policy is added.

## Execution plan after separate approval

Expected database work is small: add `fee_structures.rates_finalized BOOLEAN NOT NULL DEFAULT false`, create `fee_collection_commands`, its primary/unique/check/foreign-key constraints, its owner index, and RLS/revokes. It does not backfill or modify existing financial rows.

The `ALTER TABLE fee_structures` takes an `ACCESS EXCLUSIVE` lock. The migration sets `lock_timeout = '10s'`. Budget a 10-15 minute maintenance window, even though normal execution should be much shorter, to include writer shutdown, backups, verification, and safe recovery decisions.

After the maintenance gate and backup gate are complete, but only after explicit approval:

1. Capture a fresh read-only revision, table counts, totals, reconciliation, and fingerprints.
2. Capture a final backup and record its restore path.
3. Use the direct connection URI in an isolated shell and run exactly `python -m alembic upgrade i53b92a4c186` from `backend/`.
4. Do not use `upgrade head` for this controlled step.
5. If the command fails before commit, keep writers stopped, verify the revision remains `h42a81f3b075`, compare the fresh baseline, and diagnose. Do not retry blindly.
6. If it succeeds, verify revision `i53b92a4c186`, the new table, `rates_finalized`, RLS, grants, counts, totals, and baseline fingerprints before restoring application traffic.

Do not run automatic downgrade. If a committed migration must be abandoned before new activity, preserve a post-migration backup and follow an approved recovery plan. If any post-migration payment exists, use a forward fix or reconciliation plan; restoring an older backup alone could lose financial history.

## Backend deployment sequence

The new backend imports `FeeCollectionCommand`. Deploying it before i53 causes the single-month endpoint to fail closed when it queries the missing table; it does not safely run against h42 alone.

1. Keep the old backend serving no financial writes during maintenance.
2. Apply and verify i53 first.
3. Deploy the reviewed Phase 2 backend artifact with the new models/services/routes.
4. Start one backend instance and run authenticated smoke tests: legacy single-month replay, a normal single-month collection only if using a controlled test obligation, preview, multi-month collection, receipt read, and credit-only application.
5. Verify one cash receipt is counted once in dashboard/reporting and a credit-only application creates no new `fee_transactions` row.
6. Scale the remaining backend replicas only after smoke tests pass. Re-enable normal traffic.

Use a production-safe test strategy: pre-create a zero-value or designated test student/fee in a separately authorized operation, or perform production smoke tests with read-only preview/replay paths. Do not invent a cash transaction merely to test deployment.

## Administrator rate-confirmation procedure

After i53, all existing structures begin with `rates_finalized=false`. This preserves current snapshots and prevents new future obligations from being priced from unconfirmed rates.

For each organization/class/session where future fee generation is allowed:

1. An administrator reviews the class/session fee structure: admission, monthly, and exam amounts.
2. The administrator confirms the published future rate policy and effective session/class scope.
3. The administrator saves the structure with `rates_finalized=true` through the existing fee-structure administration API.
4. The administrator uses a collection preview for a future month and confirms the quoted charge before taking payment.

Leave the flag false when future rates remain undecided; collect advance-only credit instead. Existing issued obligations remain collectible regardless of the flag. Record each rate confirmation through the organization’s normal administrative audit process; the current schema does not add a separate rate-approval history table.

## Approval boundary

This procedure is ready for review. The unresolved gates are: verified backup plus successful restoration, Railway project/process inventory and writer shutdown plan, Supabase Cron/function/service-role review, and an operator-confirmed maintenance window. Do not run the migration until all are checked and explicit execution approval is given.
