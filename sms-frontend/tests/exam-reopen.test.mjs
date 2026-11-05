// Local browser tests. All API writes below are fixture responses, never real data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));

async function fixture(t, { role = "admin", unavailable = false, mobile = false, publishedOnly = false, resultsPage = false } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1200, height: 850 } });
  const user = { id: 1, org_id: 1, org_role: role, full_name: "Fixture User", email: "fixture@example.invalid" };
  let exam = { id: 1, name: "Fixture Final", term_id: 1, weightage: 100, start_date: "2026-10-01", end_date: "2026-10-07",
    is_locked: !publishedOnly, is_published: true };
  const calls = [];
  await context.addInitScript((actor) => localStorage.setItem("auth-storage", JSON.stringify({ state: {
    user: actor, token: "fixture-only", expiresAt: Date.now() + 3_600_000,
  }, version: 0 })), user);
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === frontend) return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers });
    if (request.method() !== "GET") calls.push({ path: pathname, method: request.method(), body: request.postData() ? request.postDataJSON() : undefined });
    if (pathname === "/auth/me") return json(user);
    if (pathname === "/exams") return json([exam]);
    if (pathname === "/sessions/active") return json({ id: 1, name: "Fixture Session" });
    if (pathname === "/terms") return json([{ id: 1, name: "Term 1" }]);
    if (pathname === "/exams/1/reopen") {
      assert.equal(role, "admin");
      if (unavailable) return json({ detail: "Reopening is unavailable until the reviewed examination snapshot migration has been applied" }, 503);
      assert.ok(request.postDataJSON().reason.trim());
      exam = { ...exam, is_locked: false, is_published: false };
      return json({ exam, snapshot_id: 44, created_at: "2026-11-05T10:00:00Z" });
    }
    if (pathname === "/exams/1/lock") { exam = { ...exam, is_locked: true }; return json(exam); }
    if (pathname === "/exams/1/publish") { exam = { ...exam, is_published: true }; return json(exam); }
    if (pathname === "/exam-papers") return json([{ id: 1, exam_id: 1, classroom_id: 1, subject_id: 1,
      subject_name: "Mathematics", classroom_name: "Grade 1 A", total_marks: 100, pass_marks: 40 }]);
    if (pathname === "/students/by-class/1") return json([{ id: 1, enrollment_id: 1, first_name: "Fixture", last_name: "Student" }]);
    if (pathname === "/exam-results/exam/1") return json([{ id: 1, student_enrollment_id: 1, exam_paper_id: 1, obtained_marks: 76, grade: "School grade", gpa: 3 }]);
    if (pathname === "/promotion/preview/1") return json({ passed_students: [], failed_students: [] });
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + (resultsPage ? "/exams/exam_result" : "/exams"));
  return { page, calls };
}

test("reopen requires a reason and confirmation, then supports relock and republish", async (t) => {
  const { page, calls } = await fixture(t);
  await page.getByRole("button", { name: "Reopen exam Fixture Final", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reopen Exam", exact: true });
  const confirm = dialog.getByRole("button", { name: "Confirm Reopen", exact: true });
  assert.equal(await confirm.isDisabled(), true);
  await dialog.getByLabel("Reason for reopening").fill("   ");
  assert.equal(await confirm.isDisabled(), true);
  assert.equal(calls.length, 0);
  await dialog.getByLabel("Reason for reopening").fill("  Correct accidental marks entry  ");
  await confirm.click();
  await page.getByText("Exam reopened. Original snapshot #44 preserved.", { exact: true }).waitFor();
  assert.deepEqual(calls[0], { path: "/exams/1/reopen", method: "POST", body: { reason: "Correct accidental marks entry" } });
  await page.getByRole("button", { name: "Lock exam", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Publish exam", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Reopen exam Fixture Final", exact: true }).filter({ visible: true }).waitFor();
  assert.deepEqual(calls.map((call) => call.path), ["/exams/1/reopen", "/exams/1/lock", "/exams/1/publish"]);
});

test("canceling the reopening dialog makes no write request", async (t) => {
  const { page, calls } = await fixture(t);
  await page.getByRole("button", { name: "Reopen exam Fixture Final", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(calls.length, 0);
});

test("teachers do not receive reopening or lifecycle controls", async (t) => {
  const { page, calls } = await fixture(t, { role: "teacher" });
  await page.getByText("Fixture Final", { exact: true }).filter({ visible: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Reopen exam Fixture Final", exact: true }).count(), 0);
  assert.equal(calls.length, 0);
});

test("missing migration shows the API message and retains the entered reason", async (t) => {
  const { page } = await fixture(t, { unavailable: true });
  await page.getByRole("button", { name: "Reopen exam Fixture Final", exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Reason for reopening").fill("Accidentally finalized");
  await page.getByRole("button", { name: "Confirm Reopen", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "snapshot migration" }).waitFor();
  assert.equal(await page.getByLabel("Reason for reopening").inputValue(), "Accidentally finalized");
});

test("published exams remain read-only even when is_locked is false", async (t) => {
  const { page, calls } = await fixture(t, { publishedOnly: true, resultsPage: true });
  await page.getByLabel("Exam", { exact: true }).selectOption("1");
  await page.getByLabel("Classroom", { exact: true }).selectOption("1");
  await page.getByText("Exam locked or published. An administrator must reopen it before corrections.", { exact: true }).waitFor();
  await page.getByText("Fixture Student", { exact: true }).filter({ visible: true }).first().waitFor();
  assert.equal(await page.getByRole("region", { name: "Class marks grid" }).getByRole("textbox").count(), 0);
  assert.equal(calls.length, 0);
});

test("reopening remains available in the existing mobile exam card", async (t) => {
  const { page } = await fixture(t, { mobile: true });
  await page.getByRole("button", { name: "Reopen exam Fixture Final", exact: true }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "Reopen Exam", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
});
