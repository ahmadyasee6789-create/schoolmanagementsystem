// Local browser fixtures only; POSTs never reach the real API or database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, mode = "success") {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
  let release;
  const hanging = new Promise((resolve) => { release = resolve; });
  t.after(async () => { release(); await context.close(); });
  const user = { id: 19, org_id: 10, org_role: "admin", full_name: "Fixture User", email: "fixture@example.invalid" };
  const papers = Array.from({ length: 7 }, (_, index) => ({ id: 11 + index, exam_id: 1, classroom_id: 5, subject_id: index + 1,
    classroom_name: "Fixture Class", subject_name: `Subject ${index + 1}`, total_marks: 100, pass_marks: 40 }));
  const students = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, enrollment_id: 101 + index,
    first_name: `Fixture ${index + 1}`, last_name: "", admission_no: `TEST-${index + 1}` }));
  const initial = Object.fromEntries(papers.flatMap((paper) => students.map((student) => [
    `${paper.id}:${student.enrollment_id}`, paper.id === 11 && student.id === 1 ? "0" : "40",
  ])));
  await context.addInitScript(({ actor, drafts }) => {
    localStorage.setItem("auth-storage", JSON.stringify({ state: {
      user: actor, token: "fixture-only", expiresAt: Date.now() + 3_600_000,
    }, version: 0 }));
    if (!sessionStorage.getItem("marks-fixture-seeded")) {
      sessionStorage.setItem("exam-result-drafts:10:19", JSON.stringify(drafts));
      sessionStorage.setItem("marks-fixture-seeded", "yes");
    }
  }, { actor: user, drafts: initial });
  const saves = [], reads = [];
  let results = [];
  let arrived;
  const requestArrived = new Promise((resolve) => { arrived = resolve; });
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === frontend && request.method() === "GET") return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers });
    if (request.method() === "GET") {
      reads.push(pathname);
      if (pathname === "/auth/me") return json(user);
      if (pathname === "/exams") return json([{ id: 1, name: "Fixture Examination", is_locked: false, is_published: false }]);
      if (pathname === "/exam-papers") return json(papers);
      if (pathname === "/students/by-class/5") return json(students);
      if (pathname === "/exam-results/exam/1") return json(results);
      if (pathname === "/promotion/preview/5") return json({ passed_students: [], failed_students: [] });
      return route.abort();
    }
    if (pathname !== "/exam-results/bulk" || request.method() !== "POST") return route.abort();
    const payload = request.postDataJSON();
    saves.push(payload);
    arrived();
    const saved = payload.map((mark) => ({ ...mark, id: mark.exam_paper_id * 1000 + mark.student_enrollment_id, grade: null, gpa: null }));
    if (mode === "reject") return json({ detail: "The save could not complete. No marks were changed." }, 503);
    if (mode === "hang" || mode === "saved-without-response") {
      if (mode === "saved-without-response") results = saved;
      await hanging;
      return route.abort().catch(() => {});
    }
    results = saved;
    return json({ succeeded: saved, failed: [] }, 201);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + "/exams/exam_result");
  await page.getByLabel("Exam", { exact: true }).selectOption("1");
  await page.getByLabel("Classroom", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "Save All (42)", exact: true }).waitFor();
  return { page, saves, reads, requestArrived };
}

test("42 marks save in one request and the saving state clears", async (t) => {
  const { page, saves } = await fixture(t);
  await page.getByRole("button", { name: "Save All (42)", exact: true }).click();
  await page.getByText("42 marks saved", { exact: true }).waitFor();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].length, 42);
  assert.equal(saves[0][0].obtained_marks, 0);
  assert.equal(await page.getByRole("button", { name: "Saving…", exact: true }).count(), 0);
  await page.waitForFunction(() => sessionStorage.getItem("exam-result-drafts:10:19") === null);
});

test("a hanging save stops waiting, preserves every draft, and never retries automatically", async (t) => {
  const { page, saves, requestArrived } = await fixture(t, "hang");
  await page.clock.install();
  await page.getByRole("button", { name: "Save All (42)", exact: true }).click();
  await requestArrived;
  await page.clock.fastForward(45_001);
  await page.getByRole("status", { name: "Marks save status" }).filter({ hasText: /Saving took too long to confirm/ }).waitFor();
  assert.equal(saves.length, 1);
  assert.equal(await page.getByRole("button", { name: "Save All (42)", exact: true }).isEnabled(), true);
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("exam-result-drafts:10:19"))).length), 42);
  const first = page.getByRole("textbox", { name: "Fixture 1: Subject 1", exact: true });
  assert.equal(await first.inputValue(), "0");
  assert.equal(await first.isEnabled(), true);
});

test("checking after a lost response confirms saved marks without a second write", async (t) => {
  const { page, saves, reads, requestArrived } = await fixture(t, "saved-without-response");
  await page.clock.install();
  await page.getByRole("button", { name: "Save All (42)", exact: true }).click();
  await requestArrived;
  await page.clock.fastForward(45_001);
  await page.getByRole("button", { name: "Check saved marks", exact: true }).click();
  await page.getByRole("status", { name: "Marks save status" }).filter({ hasText: /42 saved marks confirmed/ }).waitFor();
  await page.waitForFunction(() => sessionStorage.getItem("exam-result-drafts:10:19") === null);
  assert.equal(saves.length, 1);
  assert.ok(reads.filter((path) => path === "/exam-results/exam/1").length >= 2);
});

test("a failed save and a read-only check retain marks that are not saved", async (t) => {
  const { page, saves } = await fixture(t, "reject");
  await page.getByRole("button", { name: "Save All (42)", exact: true }).click();
  await page.getByRole("status", { name: "Marks save status" }).filter({ hasText: /No marks were changed/ }).waitFor();
  await page.getByRole("button", { name: "Check saved marks", exact: true }).click();
  await page.getByRole("status", { name: "Marks save status" }).filter({ hasText: /Saved marks checked/ }).waitFor();
  assert.equal(saves.length, 1);
  assert.equal(await page.getByRole("button", { name: "Save All (42)", exact: true }).isEnabled(), true);
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("exam-result-drafts:10:19"))).length), 42);
});
