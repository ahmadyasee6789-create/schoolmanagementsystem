# Examination reopening review

Implemented locally. No existing examination has been reopened automatically, no production data was changed, and no migration was executed.

## Behavior

- School administrators see Reopen on locked or published examinations, on desktop and mobile.
- Confirmation requires a non-empty reason. The API derives school and administrator identity from authentication.
- One transaction locks the organization and examination, inserts an immutable snapshot, flushes it, clears both status flags, and commits. Any failure rolls everything back.
- Snapshots include original examination status/metadata, every existing result (including null marks), paper definitions, applicable grade configuration, calculated grade/evaluation data, student/enrollment identifiers and DMC names, administrator, UTC timestamp, reason, and a SHA-256 integrity digest.
- Results are never deleted or reset by reopening. Corrections use the existing marks endpoints.
- Marks saves, bulk saves, result deletion, and paper definition changes reject locked OR published exams. All participating writers use the same organization-then-examination lock order.
- Publish and Lock are administrator-only. Unpublished corrected exams can be locked and then published again.
- A previously finalized legacy exam can finalize again without retroactive grading-policy requirements; first-time finalization retains the existing complete-coverage check.
- Republish never updates or deletes an earlier snapshot. Another reopening appends another snapshot.
- Grade-scale historical protection remains active for preserved final snapshots after reopening. Reopening is not a route around grading-policy protection.

## Migration requiring separate approval

`backend/alembic/versions/k75d14e6f308_exam_reopen_snapshots.py`

- Revision: `k75d14e6f308`; dependency: `j64c03d5e297`.
- Adds `exam_reopen_snapshots` and an ownership uniqueness constraint on `(exams.id, exams.organization_id)` for its composite foreign key.
- Adds an organization/examination/history index, administrator foreign key, reason/hash checks, and PostgreSQL triggers rejecting UPDATE, DELETE, and TRUNCATE.
- Enables RLS and revokes PUBLIC, anon, and authenticated access, following the backend-only access pattern already used for financial tables. The backend needs owner/BYPASSRLS access, SELECT/INSERT on the new table, and sequence privileges. These production privileges have not been checked in this task.
- Does not alter examination flags, marks, grades, or existing records; performs no backfill.
- Automatic downgrade is blocked to avoid discarding audit history.
- Creating the ownership constraint can acquire a lock on exams. The file sets a 10-second lock timeout; it must be reviewed in a controlled maintenance procedure.

The migration source/dependency was checked statically. Tests created equivalent model metadata and protections in disposable databases; the Alembic upgrade itself was NOT executed or rehearsed.

Until the migration is reviewed and separately applied, the Reopen endpoint returns HTTP 503 with an explanatory message and leaves statuses/marks unchanged. Existing exam models gain no required columns, so ordinary reads do not depend on the new table.

## Exact reopening procedure after approval

1. Review this change and the migration. Verify the intended database, its current Alembic revision, a restorable backup, and the backend role's private-table privileges. Arrange a controlled write pause for the schema change.
2. Separately authorize/apply revision `k75d14e6f308` to that verified database. This has not been done by the agent. Confirm both immutable triggers and RLS/private privileges are installed before enabling reopening.
3. Run the matching backend and frontend code. Sign in as an administrator of the examination's school and select the correct academic session.
4. Open Examinations, locate the correct exam, click Reopen, enter the correction reason, and choose Confirm Reopen.
5. Wait for the success message containing the preserved snapshot ID. Verify the exam is now draft, unlocked, and unpublished. If reopening fails, do not clear flags manually.
6. Review original history through authenticated GET `/exams/{exam_id}/reopen-snapshots`, or GET `/exams/{exam_id}/reopen-snapshots/{snapshot_id}` for the complete immutable payload.
7. Open Exam Results and correct the marks using the existing class/subject entry workflow. Save and review totals and evaluations.
8. Return to Examinations, Lock the exam, then Publish it after review. The original snapshot remains available at its original ID.

The current DMC generator continues to reflect current results. Original published data is retained in the snapshot API; an archived-PDF viewer/generator is outside this change.

## Files

- Backend model/storage: `app/models/exam_reopen_snapshot.py`, `app/models/exams.py`, `app/models/__init__.py`, `app/db/exam_snapshot_security_v1.py`.
- Backend API/services: `app/schemas/exam_reopen.py`, `app/services/exam_reopening.py`, `app/services/exam_snapshot_storage.py`, `app/services/exam_editing.py`, `app/services/grade_scales.py`, `app/routers/exams.py`, `app/routers/exams_results.py`, `app/routers/exam_papers.py`.
- Frontend: `app/(dashboard)/exams/page.tsx`, `components/exams/ReopenExamDialog.tsx`, `components/exams/ExamsList.tsx`, `components/exams/ExamResultsWorkspace.tsx`, `components/exams/ExamFormModal.tsx`, and the historical-protection explanation in `app/(dashboard)/exams/grade-scale/page.tsx`.
- Tests: `backend/tests/test_exam_reopen.py`, `sms-frontend/tests/exam-reopen.test.mjs`.

## Validation

- 18 reopen/snapshot tests passed in isolated PostgreSQL, covering rollback, cross-school ownership, immutable SQL operations, duplicate/concurrent requests, atomic visibility, and publication-versus-save locking.
- SQLite: 14 new checks passed, with 4 PostgreSQL-only cases skipped; 51 existing focused regressions passed, with 2 PostgreSQL-only grade checks skipped.
- 17 browser checks passed using mocked APIs: 6 new reopening cases plus existing marks-entry, request-count, and grade-scale regressions. These cover confirmation, cancellation, roles, missing-migration messaging, published read-only results, and mobile layout. An initial sandboxed attempt was blocked from reaching localhost; the same checks passed with local network access enabled.
- TypeScript, targeted ESLint, and git diff checks passed. Existing Pydantic configuration/deprecation warnings remain.

No deployment, commit, push, or production write was performed.
