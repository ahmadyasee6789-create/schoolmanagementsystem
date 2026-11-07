// Run against the local Next.js server. The browser never forwards API calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname), "Use a local Next.js server");
const user = { id: 91, org_id: 7, org_role: "admin", full_name: "Fixture Admin", email: "fixture@example.invalid" };
const exam = { id: 1, name: "Mock Final", start_date: "2026-10-01", end_date: "2026-10-10", term_id: 1 };
const paper = { id: 1, exam_id: 1, classroom_id: 1, subject_id: 1, total_marks: 100, pass_marks: 40,
  exam_name: exam.name, classroom_name: "Class 1 A", subject_name: "Synthetic Math" };
const classrooms = [{ id: 1, grade_name: "Class 1", section: "A" }, { id: 2, grade_name: "Class 2", section: "A" }];
const student = { id: 1, first_name: "Mock", last_name: "Student", roll_number: "1", enrollment_id: 101 };
const otherStudent = { ...student, id: 2, first_name: "Second", enrollment_id: 102 };

async function checkRequests(t, routePath, expected, ready) {
  const browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript((actor) => {
    localStorage.setItem("auth-storage", JSON.stringify({
      state: { user: actor, token: "fixture-only", expiresAt: Date.now() + 3_600_000 }, version: 0,
    }));
  }, user);

  const counts = {};
  const cors = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization" };
  const fixtures = {
    "/auth/me": user, "/exams": [exam], "/classes": classrooms, "/subjects": [],
    "/exam-papers": routePath.endsWith("/dmc_generator")
      ? [paper, { ...paper, id: 2, classroom_id: 2, classroom_name: "Class 2 A" }] : [paper],
    "/students/by-class/1": [student], "/students/by-class/2": [otherStudent],
    "/exam-results/exam/1": [
      { id: 1, exam_paper_id: 1, student_enrollment_id: 101, obtained_marks: 76, grade: "B", gpa: null },
      { id: 2, exam_paper_id: 2, student_enrollment_id: 102, obtained_marks: 81, grade: "A", gpa: null },
    ],
  };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname, searchParams } = new URL(request.url());
    if (origin === frontend) return route.continue();
    if (pathname === '/exam-results/sheet') {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const id = Number(searchParams.get('classroom_id'));
      const person = id === 1 ? student : otherStudent;
      const mark = id === 1 ? 76 : 81;
      const key = `/exam-results/sheet?classroom_id=${id}`;
      counts[key] = (counts[key] || 0) + 1;
      return route.fulfill({ headers: cors, json: {
        columns: [{ key: '1:100', subject_name: paper.subject_name, total_marks: 100 }],
        items: [{ enrollment_id: person.enrollment_id, student_name: `${person.first_name} ${person.last_name}`, roll_number: '1',
          result: 'PASSED', percentage: mark, grade: 'B', missing_count: 0,
          subjects: [{ key: '1:100', paper_id: id, subject_name: paper.subject_name, obtained_marks: mark, total_marks: 100, grade: 'B' }] }],
      } });
    }
    if (!Object.hasOwn(fixtures, pathname)) return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    assert.equal(request.method(), "GET");
    counts[pathname] = (counts[pathname] || 0) + 1;
    return route.fulfill({ json: fixtures[pathname], headers: cors });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(frontend + routePath);
  await ready(page);
  console.log(routePath, JSON.stringify(counts));
  for (const path of expected) assert.equal(counts[path], 1, path);
}

test("initial Exam Papers load makes one request for each data source", async (t) => {
  await checkRequests(t, "/exams/exam_paper", ["/auth/me", "/exam-papers", "/exams", "/classes", "/subjects"],
    (page) => page.getByText(paper.subject_name, { exact: true }).filter({ visible: true }).first().waitFor());
});

test("initial Exam Results load makes one request for each data source", async (t) => {
  await checkRequests(t, "/exams/exam_result", ["/auth/me", "/exam-papers", "/exams"],
    (page) => page.getByLabel("Exam", { exact: true }).getByRole("option", { name: exam.name }).waitFor({ state: "attached" }));
});

test("DMC loads each setup list once and fetches only the selected class saved sheet", async (t) => {
  await checkRequests(t, "/exams/dmc_generator", [
    "/auth/me", "/exams", "/exam-papers", "/classes", "/exam-results/sheet?classroom_id=1", "/exam-results/sheet?classroom_id=2",
  ], async (page) => {
    await page.getByRole("combobox").nth(0).selectOption("1");
    const classroom = page.getByRole("combobox").nth(1);
    await classroom.selectOption("1");
    await page.getByText("Mock Student", { exact: true }).filter({ visible: true }).first().waitFor();
    await classroom.selectOption("2");
    await page.getByText("Second Student", { exact: true }).filter({ visible: true }).first().waitFor();
    assert.equal(await page.getByText("Mock Student", { exact: true }).filter({ visible: true }).count(), 0);
  });
});
