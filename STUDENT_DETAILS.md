# Student details and editing

The existing empty `sms-frontend/app/(dashboard)/students/[student_id]/page.tsx` now serves `/students/{studentId}`. The list has View actions on both desktop rows and mobile cards. Both list and details use the same Edit Student dialog.

Overview displays persisted student fields and the authenticated organization's active-session enrollment. Results reuse the existing exam results component in read-only mode. Fees and Attendance show explanatory placeholders linking to the existing management screens; their current APIs do not expose individual student history. No fee collection logic was changed.

## Files added

| File | Purpose |
| --- | --- |
| `sms-frontend/app/providers/QueryProvider.tsx` | React Query v5 provider; separate cache per account, organization and role |
| `sms-frontend/app/lib/studentApi.ts` | Typed authenticated requests and FastAPI validation-error handling |
| `sms-frontend/app/hooks/useStudents.ts` | Detail, list, results and update hooks; cache invalidation |
| `sms-frontend/components/students/EditStudentDialog.tsx` | Reusable profile form, validation, save state and discard confirmation |
| `sms-frontend/components/students/StudentOverview.tsx` | Personal, guardian and academic sections |
| `sms-frontend/components/students/StudentActivityTabs.tsx` | Results and links to existing fee/attendance screens |
| `sms-frontend/components/students/StudentDetailStates.tsx` | Skeleton and error states |
| `backend/tests/test_student_details.py` | 12 integration tests using disposable SQLite fixtures |
| `STUDENT_DETAILS.md` | Implementation and verification notes |

## Existing files completed or modified

| File | Change |
| --- | --- |
| `sms-frontend/app/(dashboard)/students/[student_id]/page.tsx` | Completed previously empty details route, responsive header and keyboard-accessible tabs |
| `sms-frontend/app/(dashboard)/students/page.tsx` | Query-backed list, shared edit dialog, delete/import/create cache refresh |
| `sms-frontend/components/students/Studenttable.tsx` | View Student link |
| `sms-frontend/components/students/Studentcard.tsx` | Mobile View Student link |
| `sms-frontend/components/students/types.tsx` | Nullable profile fields, string roll numbers, typed details/enrollment/update contracts |
| `sms-frontend/components/exams/ExamUi.tsx` | Existing shared modal now uses native modal semantics, focus trapping/restoration, Escape and scroll locking |
| `sms-frontend/components/exams/StudentResultsList.tsx` | Optional delete callback supports read-only reuse |
| `sms-frontend/app/layout.tsx` | Mount QueryProvider inside existing auth/theme providers |
| `sms-frontend/package.json` and `package-lock.json` | Add requested React Query v5, which was absent in this checkout |
| `backend/app/crud/student.py` | Eager-load actual grade relation; allow details without an active session |
| `backend/app/routers/students.py` | Correct nonexistent `classroom.name` reference; return active-session, grade and section data |
| `backend/app/schemas/student.py` | Include admission number, handle nullable surnames, validate partial updates |

## Existing endpoints reused

- `GET /students`: filtered, paginated list.
- `GET /students/{student_id}/details`: profile, active session and matching enrollment.
- `PUT /students/{student_id}`: existing partial-update behavior, sending only changed profile fields. PATCH is not supported by this backend.
- `GET /exam-results/student/{student_id}` and `GET /exam-papers`: results and paper labels.
- Existing list support calls to `/classes`, `/grades` and `/sessions/active` remain in place, as do existing student create, delete and import endpoints.

No endpoints, models or migrations were added. Deploy the updated backend alongside the frontend to expose the corrected response fields. Existing authentication and organization filters remain authoritative; organization and enrollment fields cannot be changed through StudentUpdate.

## Form and cache behavior

- First name is required. Last name remains optional because imported single-name students and the database support null surnames.
- The form supports optional contact/guardian fields, gender, birth date and active status. Enrollment values are read-only on Overview and absent from the edit payload.
- Backend validation enforces field lengths, valid email/date values, nonempty first names, non-null status and non-future birth dates. Errors appear at the relevant field and in a summary.
- Save is guarded against duplicate submissions. Closing via Cancel, Escape, backdrop or close button prompts before discarding changes. Page unload also warns while dirty.
- Successful edits update cached profile fields, invalidate `['student', studentId]` and `['students']`, refetch active queries, close the dialog and show the existing toast notification.
- Query caches are replaced when the authenticated account, organization or role changes. No organization ID is sent to override server access control.

## Verification (22 October 2026)

- Backend suite: **57 tests passed**, including the 12 student profile tests. Coverage includes real GET/PUT routes, active and absent sessions, absent/inactive enrollment, null surnames, validation, unchanged enrollment fields, unauthorized access and cross-organization GET/PUT rejection.
- Targeted ESLint checks cover all changed frontend source files.
- Standard `tsc --noEmit --incremental false` reports four pre-existing TS5097 errors in employee component imports: `DeleteEmployeeDialog.tsx`, `Employeecard.tsx`, `Employeeformdialog.tsx` and `Employeetoolbar.tsx`. These unrelated files were left unchanged. `tsc --noEmit --incremental false --allowImportingTsExtensions` passes.
- Chromium browser checks connected the running Next.js frontend to the real FastAPI routes using a disposable in-memory SQLite database. They covered list View/Edit navigation, search/filter/pagination, profile reads, partial PUT persistence, backend field errors, client validation, duplicate-submit protection, dirty-form confirmation, details/list query refresh, results, loading/error/empty states, keyboard tabs/focus trapping, dark mode and 1440/768/390-pixel layouts.
- No production API was called by the browser checks and no live student records were changed. Production PostgreSQL deployment and real account sessions were not exercised. Firefox, Safari and physical mobile devices were not tested.

Backend test command (from `backend`):

```powershell
.\venv\Scripts\python.exe -B -W ignore::DeprecationWarning -m unittest discover -s tests -v
```

React Query integration follows the [official v5 quick start](https://tanstack.com/query/v5/docs/framework/react/quick-start) and [query invalidation guidance](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation).
