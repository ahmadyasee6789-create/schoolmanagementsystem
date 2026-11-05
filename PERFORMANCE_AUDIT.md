# School Management System performance audit

Local audit: 5 November 2026. Changes are local and uncommitted. No migrations, production writes, deployments, or stress tests were performed.

## Result

Database network latency amplified repeated SQL queries. Promotion preview, subject assignments, fee history, student results, and dashboard cache misses now use fewer round trips. Dashboard, Examinations, and Expenses requests are deduplicated; duplicate token-refresh timers were removed. Financial and examination rules are unchanged. Existing correctness blockers listed below prevent an unconditional production-readiness claim.

## Scope and measurement method

Strategically inventoried 25 FastAPI routers, 114 decorated operations (53 GETs), 29 model classes, 32 Next.js pages and their layouts, shared data hooks, Axios/authentication, the Redis cache, ORM relationships, services, and database lifecycle. Profiled 23 GET route families strategically; other endpoints were reviewed statically, not benchmarked.

Measurements use the real local FastAPI application through an in-process HTTP client, real authentication/database dependencies, and database-enforced read-only Supabase connections. A temporary process-only signing key keeps diagnostic tokens unusable by running services. Dashboard cache misses were forced without writing Redis. Tests that write data used synthetic SQLite or isolated loopback PostgreSQL. No secrets, response bodies, names, or financial records were recorded in profiling output.

The main table uses the mean of two observations for the small fixture cohort; the first four optimized routes use one matched observation before/after on the larger existing cohort. Results are diagnostic samples, not percentile/SLA or production measurements. Network conditions varied between runs. Application SQL counts exclude pool pre-ping and implicit BEGIN/ROLLBACK. Authentication, checkout, SQL, and serialization timings overlap and must not be added.

## Ten slowest successful route families in the measured baseline

Endpoint | Before | After | SQL queries before/after | Improvement
--- | ---: | ---: | ---: | ---
`/promotion/preview/{id}` | 28.02 s | 3.71 s | 83 / 7 | 86.7% observed reduction
`/subjects/assignments` | 6.69 s | 2.91 s | 16 / 4 | 56.5% observed reduction
`/dashboard/stats (cache miss)` | 6.50 s | 5.41 s | 16 / 12 | 16.8% observed reduction
`/fees/students/{id}/history` | 5.80 s | 4.12 s | 14 / 8 | 28.9% observed reduction
`/exam-results/student/{id}` | 4.86 s | 3.08 s | 9 / 6 | 36.6% observed reduction
`/students` | 3.38 s | 2.77 s | 5 / 5 | No code change; network variation
`/students/{id}/details` | 3.00 s | 2.46 s | 4 / 4 | No code change; network variation
`/exam-results/exam/{id}` | 2.98 s | 2.47 s | 4 / 4 | No code change; network variation
`/students/by-class/{id}` | 2.97 s | 2.47 s | 4 / 4 | No code change; network variation
`/exam-papers` | 2.71 s | 2.18 s | 3 / 3 | No code change; network variation

The three originally reported routes had already received earlier N+1 fixes. They were deliberately not rewritten in this pass. Their current cold/reused-connection measurements are:

Endpoint | Cold connection request | Reused connection request | SQL queries
--- | ---: | ---: | ---:
`/exam-papers` | 3.74 s | 2.32 s | 3
`/exams` | 3.61 s | 2.30 s | 3
`/classes` | 3.38 s | 2.03 s | 2

Cold here means the SQLAlchemy pool was disposed before the request, creating a fresh connection; full first-process startup is a separate measurement. Browser-observed 13.61-second timings are not directly comparable to these isolated API measurements.

## Database, authentication, serialization, and Redis

- Raw DBAPI connection: 2.18 s. First engine checkout including dialect startup: about 4.7-5.7 s. Reused session checkout: about 0.61-0.79 s, including connection validation; measured close/rollback costs are separate from the SELECT timer.
- Reused SELECT 1: about 307-388 ms including network, versus about 0.02-0.03 ms execution inside PostgreSQL. The local-to-Supabase round trip is the dominant floor.
- JWT verification alone: 0.0366 ms. Warm authentication dependency: about 1.2-1.6 s, mostly checkout and its user/membership SQL query. No authentication cache or permissions change was introduced.
- Serialization normally measured below 1 ms. Employee-list serialization includes about 0.31-0.39 s because that route returns an unevaluated ORM Query; this is SQL/network time during serialization, not expensive JSON CPU work. The route already uses only two application queries and was left unchanged.
- Existing pool: QueuePool size 5, max_overflow 10, pre_ping enabled, timeout 30 s, no recycle limit. get_db closes its session in finally; sessions are request-scoped. No per-request engine creation was found. No pool-size, pre-ping, connection URL, transaction, or schema changes were made.
- The configured Supabase connection uses its transaction-pooler port. No named prepared-statement dependency was found. Actual production worker counts, pool saturation, Supabase connection limits, and Railway/Vercel region latency are NOT MEASURED.
- Existing indexes were inspected: classrooms 3, exam_papers 3, exam_results 4, student_enrollments 2, student_fees 3, fee_transactions 5, fee_allocations 4. Representative enrollment, fee, and marks query plans executed inside PostgreSQL in 0.094, 0.123, and 0.114 ms respectively. No index migration is justified by these measurements.
- Redis uses one shared pooled client and currently serves only dashboard caching. First localhost ping was about 2.02-2.06 s; reused GET/PING was about 0.1-0.5 ms. A separate IPv4 loopback first ping was 5.64 ms. Local address-family/hostname connection setup is a likely contributor, not a proven production diagnosis.
- Dashboard cache keys include organization, active session, and role; expiration is 30 seconds. There is no immediate financial-write invalidation. Cache GET already tolerates Redis errors; cache SET now does too. Unavailable/slow Redis response behavior with its configured 5-second timeouts is NOT MEASURED; timeouts and URLs were left unchanged.

## Implemented fixes

- Promotion preview: batch students, papers, and marks, then call the existing shared evaluator. Missing/null marks, zero marks, the 40% aggregate threshold, and fewer than three failed subjects retain their existing meanings. The promotion write path was not changed.
- Subject assignments: reuse existing classroom/subject joins and eager-load grade and optional teacher/user relationships. This removes lazy relationship queries without changing the returned fields.
- Student results: eager-load exam papers and load grading bands once per response, sharing the existing exam-list projection.
- Fee ledger: populate the already joined student relationship, avoiding one student query per row. Discount, paid, partial, and outstanding calculations are unchanged. Successful live ledger timing is NOT MEASURED: the sampled legacy month returned the existing ambiguous-billing-year 409. Disposable-data tests verify two handler queries and the existing exact balances.
- Fee history: load allocations, payments, and yearly adjustments in batches for this read only. Existing money checks, ownership checks, allocation reconciliation, and negative-credit rejection still run. Writer callers retain their original uncached behavior.
- Dashboard: combine student and attendance counts and reuse the class IDs already fetched. Financial aggregation formulae and filters are unchanged. A failed optional Redis SET no longer turns a successfully computed dashboard into a 500.
- Frontend: reuse the existing account/organization/role-scoped QueryProvider on Dashboard and Examinations; stop reading the unscoped dashboard_stats localStorage cache; remove the second refresh-hook owner from the root layout.
- Expenses: use the same query provider for categories and paginated results, cancel obsolete requests, preserve debounced search, and reset changed filters to page one without an intermediate old-page request. No backend/API contract changes were made.

## Before/after projection and frontend checks

- Full fee-history response equality against the original implementation: True. Handler comparison: 5.072 s / 12 queries to 2.978 s / 6 queries. Authentication is excluded in this separate comparison.
- Full dashboard response equality against the original implementation: True. Handler comparison: 4.686 s / 14 queries to 3.331 s / 10 queries. Authentication and active-session loading are excluded.
- Examinations setup requests: each of sessions/active, terms, and exams fell from 2 to 1 in the development browser. Scheduled refresh requests fell from 2 to 1. Expense list and category requests each fell from 2 to 1.
- Dashboard now makes one request and ignores an injected financial cache from a previous account. Existing Exam Papers, Exam Results, and DMC setup tests continue to show one request per source. Strict Mode remains enabled.

## DMC correctness versus performance

Both current templates returned HTTP 200 with valid PDFs for a complete class of 23 students and 7 subjects. Two per A4: 4.405 s with 59.1 ms rendering. Three per A4: 3.665 s with 50.2 ms rendering. Each uses 6 data queries. These DMC HTTP rehearsals override authentication and the active-session dependency, so they are not directly comparable to the fully authenticated main table. Full authenticated DMC timing and receipt PDF timing are NOT MEASURED.

The reported two-per-page 500 was not reproduced in the current code; no new PDF correctness fix was claimed. Existing synthetic tests cover logos, ranks including ties, grades, zero and missing marks, session isolation, and both HTTP layouts with up to 12 subjects. Font/layout changes from the preceding task were retained.

## Page to API to database map

Frontend flow | API families | Implementation and database work
--- | --- | ---
Dashboard | dashboard/stats | dashboard router; scoped counts and financial aggregates; Redis
Student list/profile | students, students/{id}/details, enrollments | student CRUD; paginated enrollment join; eager-loaded profile enrollment/class/grade/session
Student profile results | exam-results/student/{id} | result router; scoped enrollment/results join and one grading-band load
Academics | sessions, terms, grades, classes, subjects, subjects/assignments | organization/session filters; classroom/grade/teacher and class-subject joins
Attendance | classes, attendance | attendance router; recorded rows or enrolled students fallback
Examinations/papers | exams, exam-papers, terms, classes, subjects | eager-loaded exam/class/grade/subject read projections
Class/subject marks entry | exam-results/exam/{id}, students/by-class/{id}, promotion/preview/{id}, exam-results/bulk | shared result records and evaluator; batched read preview; locked write service unchanged
DMC | setup lists, student/results lists, dmc/exam/{id}/class/{id} | six batched data reads; school_logo service; existing ReportLab renderers
Promotion | classes, sessions, promotion/preview, promotion/class | batched preview; existing promotion writer unchanged
Fee ledger/structure | fees/ledger, fee-structure, classes, sessions | scoped paginated ledger and structure join; existing financial calculations
Student fee collection/history | fees/collection/*, fees/students/*, payments/* | multi_fee_collection, fee_reads, fee_allocations, collection commands; locks/idempotency unchanged
Expenses/payroll | expenses, categories, employees, payroll/* | paginated expenses; category joins; scoped staff/payment reads; writes unchanged
Reports | reports/fees, reports/exam-results, reports/class/*; other requested paths below | fee projection, legacy report implementations, contract mismatches
Organization/settings/auth | organization/profile, team, invitations, auth/* | organization/logo services and membership/token dependencies
Superadmin | superadmin/* | separate organization/statistics router; static review only

## Validation

- 83 focused existing SQLite checks passed: authentication, student details, exam lists/results, DMC, fee integrity, and financial permissions.
- 37 multi-fee SQLite checks passed, including partial/advance payments, yearly discounts, rollback, snapshots, and receipts.
- 7 new query-budget/reconciliation checks passed on both SQLite and disposable PostgreSQL.
- Disposable PostgreSQL financial suite: 116 checks, 112 passed, 4 fixture-specific skips. Includes concurrency, duplicate requests, credit-only collection, and yearly discounts. No migration-execution tests were run.
- 16 browser cases passed across existing fee/exam workflows and the five performance regressions. Every backend call was mocked. New tests first reproduced duplicate requests and the unscoped cache before the fixes.
- TypeScript npx tsc --noEmit and targeted ESLint passed. git diff --check passed after final cleanup.
- Existing Pydantic configuration and datetime.utcnow deprecation warnings remain; they are not new test failures.
- Production build/bundle profiling: NOT MEASURED. The active development build was not replaced. Rendering CPU, Web Vitals, production p95, every tenant/data size, write-endpoint production timings, and saturation are NOT MEASURED.

## Remaining blockers and next investigations

1. Confirmed existing report failures: reports/exam-results and reports/class/{id} returned HTTP 500 before and after this pass. Their legacy code references unavailable fields such as ExamPaper.date or Student.full_name; the student route also declares a list response while returning a report object. Fixing these requires a deliberate report-contract repair, not a performance-only substitution.
2. Static frontend/API mismatches: Student Report requests limit=500 while GET students allows at most 100; Attendance Report requests a missing reports/attendance route; Payroll Report requests an aggregate reports/payroll route while the backend exposes reports/payroll/{teacher_id} and references an undefined TeacherSalary model. Promotion UI omits required exam_id. These paths require follow-up correctness work; no replacement endpoints or arbitrary exam choices were invented.
3. Static isolation concerns needing separate regression fixes: attendance GET/fallback lack complete organization/session scoping; teacher dashboard cache keys omit teacher identity; parts of dashboard class distributions are not session-filtered. These existing paths were not probed across real tenants or silently changed in this performance pass.
4. Remaining N+1 candidates: student payment listing still calls payment_info/credit reads per receipt, and promotion writes retain their original per-student evaluation reads. Their production-sized cost is NOT MEASURED; financial locking/retry behavior was deliberately not refactored.
5. More pages still use mount effects and some report/class tables are unbounded. Only measured duplicate sources were changed. Large-table rendering, Recharts/MUI bundle costs, and production lazy-loading benefit are NOT MEASURED.
6. Basic local requests still pay cloud round-trip, authentication, pre-ping, and rollback costs. Verify actual deployment/database regions and provider limits before changing infrastructure or pooling. No pool increase or database URL change is justified by this sequential audit.

## Files changed

- `backend/app/routers/dashboard.py`
- `backend/app/routers/exams_results.py`
- `backend/app/routers/promotion.py`
- `backend/app/routers/student_fee.py`
- `backend/app/routers/subjects.py`
- `backend/app/services/fee_allocations.py`
- `backend/app/services/fee_reads.py`
- `sms-frontend/app/(dashboard)/exams/page.tsx`
- `sms-frontend/app/(dashboard)/finance/expenses/page.tsx`
- `sms-frontend/app/(dashboard)/page.tsx`
- `sms-frontend/app/hooks/usePaginatedQuery.ts`
- `sms-frontend/app/layout.tsx`
- `backend/tests/test_performance_queries.py`
- `sms-frontend/tests/performance-api-requests.test.mjs`
- `PERFORMANCE_AUDIT.md`

Temporary timing instrumentation, test copies, and profiling metadata are removed after report creation. No runtime profiling hooks remain in application code.
