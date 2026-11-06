// Run against local Next.js. All API traffic is intercepted with fixtures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://127.0.0.1:45898";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
const user = { id: 19, org_id: 10, org_role: "admin", full_name: "Fixture Admin", email: "fixture@example.invalid" };
const students = [
  { id: 1, enrollment_id: 101, first_name: "Ali", last_name: "Khan", admission_no: "A101" },
  { id: 2, enrollment_id: 102, first_name: "Sara", last_name: "Khan", admission_no: "A102" },
];
const math = { id: 11, exam_id: 1, classroom_id: 5, classroom_name: "Grade 5 A", subject_name: "Math", total_marks: 100, pass_marks: 40 };
const english = { ...math, id: 12, subject_name: "English" };
const lockedPaper = { ...math, id: 21, exam_id: 2 };
const cors = {
  "access-control-allow-origin": frontend,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};
const result = (paper, enrollment, mark) => ({
  id: paper * 1000 + enrollment, exam_paper_id: paper, student_enrollment_id: enrollment,
  obtained_marks: mark, grade: null, gpa: null,
});

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  t.after(() => context.close());
  await context.addInitScript((user) => {
    localStorage.setItem("auth-storage", JSON.stringify({
      state: { user, token: "fixture-token", expiresAt: Date.now() + 3_600_000 }, version: 0,
    }));
  }, user);
  const results = [result(11, 101, 30), result(11, 102, 42), result(12, 102, 42)];
  const saves = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === frontend && request.method() === "GET") return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const reply = (json, status = 200) => route.fulfill({ json, status, headers: cors });
    switch (url.pathname) {
      case "/auth/me": return reply(user);
      case "/exams": return reply([{ id: 1, name: "Final", is_locked: false }, { id: 2, name: "Midterm", is_locked: true }]);
      case "/exam-papers": return reply([math, english, lockedPaper]);
      case "/students/by-class/5": return reply(students);
      case "/exam-results/exam/1": return reply(results);
      case "/exam-results/exam/2": return reply([result(21, 101, 63)]);
      case "/promotion/preview/5":
        if (url.searchParams.get("exam_id") === "2") {
          return reply({ passed_students: [{ student_id: 1, result: "PASSED", percentage: 63, failed_count: 0 }], failed_students: [] });
        }
        assert.equal(url.searchParams.get("exam_id"), "1");
        return reply({
          passed_students: [
            { student_id: 2, result: "PASSED", percentage: 42, failed_count: 0 },
            ...(results.some((row) => row.exam_paper_id === 12 && row.student_enrollment_id === 101)
              ? [{ student_id: 1, result: "PASSED", percentage: 45, failed_count: 0 }] : []),
          ],
          failed_students: [],
        });
      case "/exam-results/bulk": {
        const payload = request.postDataJSON();
        saves.push(payload);
        const failed = [];
        const succeeded = [];
        payload.forEach((mark, index) => {
          if (saves.length === 1 && mark.exam_paper_id === 12) {
            failed.push({ ...mark, index, error: "Fixture rejected this mark" });
            return;
          }
          const saved = result(mark.exam_paper_id, mark.student_enrollment_id, mark.obtained_marks);
          const existing = results.findIndex((row) => row.id === saved.id);
          if (existing === -1) results.push(saved);
          else results[existing] = saved;
          succeeded.push(saved);
        });
        return reply({ succeeded, failed }, 201);
      }
      default: return reply({ detail: "Unexpected request" }, 404);
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  page.on("dialog", (dialog) => void dialog.accept());
  return { page, saves };
}

async function selectClass(page, examId) {
  await page.getByLabel("Exam", { exact: true }).selectOption(examId);
  await page.getByLabel("Classroom").selectOption("5");
}

test("class and subject entry share saved marks and keep failed or invalid drafts", async (t) => {
  const { page, saves } = await fixture(t);
  await page.goto(frontend + "/exams/exam_result");
  const classTab = page.getByRole("tab", { name: "By Class" });
  assert.equal(await classTab.getAttribute("aria-selected"), "true");
  assert.equal(await page.getByRole("tab").count(), 2);
  await selectClass(page, "1");
  const grid = page.getByRole("region", { name: "Class marks grid" });
  const aliMath = grid.getByRole("textbox", { name: "Ali Khan: Math" });
  const aliEnglish = grid.getByRole("textbox", { name: "Ali Khan: English" });
  await aliMath.waitFor();
  assert.equal(await aliMath.inputValue(), "30");
  assert.equal(await aliEnglish.getAttribute("placeholder"), "Missing");
  await aliMath.fill("42");
  await aliMath.press("ArrowRight");
  assert.equal(await aliEnglish.evaluate((element) => document.activeElement === element), true);
  await aliEnglish.fill("48");
  const saraMath = grid.getByRole("textbox", { name: "Sara Khan: Math" });
  await saraMath.fill("101");
  assert.equal(await saraMath.getAttribute("aria-invalid"), "true");
  await page.getByRole("button", { name: "Save All (3)", exact: true }).click();
  await grid.getByText("Fixture rejected this mark").waitFor();
  assert.deepEqual(saves[0], [
    { exam_paper_id: 11, student_enrollment_id: 101, obtained_marks: 42 },
    { exam_paper_id: 12, student_enrollment_id: 101, obtained_marks: 48 },
  ]);

  await page.getByRole("tab", { name: "By Subject" }).click();
  await page.getByLabel("Subject / Class").selectOption("11");
  assert.equal(await page.getByRole("spinbutton", { name: "Ali Khan: Math" }).inputValue(), "42");
  await page.getByLabel("Subject / Class").selectOption("12");
  assert.equal(await page.getByRole("spinbutton", { name: "Ali Khan: English" }).inputValue(), "48");
  await page.getByRole("button", { name: "Save All (1)", exact: true }).click();
  await page.getByText("1 mark saved", { exact: true }).last().waitFor();
  await classTab.click();
  await grid.getByRole("row", { name: /Ali Khan/ }).getByText("45% · 0 failed").waitFor();
  assert.equal(saves.length, 2);

  await page.reload();
  await selectClass(page, "1");
  assert.equal(await saraMath.inputValue(), "101");
  assert.equal(await aliEnglish.inputValue(), "48");
});

test("a locked exam shows saved and missing marks without edit controls", async (t) => {
  const { page, saves } = await fixture(t);
  await page.goto(frontend + "/exams/exam_result");
  await selectClass(page, "2");
  const grid = page.getByRole("region", { name: "Class marks grid" });
  await grid.getByText("63", { exact: true }).waitFor();
  await grid.getByText("Missing", { exact: true }).waitFor();
  assert.equal(await grid.getByRole("textbox").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Save All" }).count(), 0);
  assert.deepEqual(saves, []);
});
