// Local UI regressions. Every API call is intercepted; no real school data is used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
const names = ["Mathematics", "English", "Urdu", "Science", "Islamiat", "Social Studies", "Computer"];
const subjects = [...names, "Art"].map((name, index) => ({ id: index + 1, name }));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, { role = "admin", existing = 0, saveError = false, assignmentError = false, mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1200, height: 900 }, serviceWorkers: "block" });
  t.after(() => context.close());
  const user = { id: 1, org_id: 1, org_role: role, full_name: "Fixture User", email: "fixture@example.invalid" };
  const exams = [
    { id: 1, name: "First Term Examination", is_locked: false, is_published: false },
    { id: 2, name: "Locked Examination", is_locked: true, is_published: false },
    { id: 3, name: "Published Examination", is_locked: false, is_published: true },
  ].map((exam) => ({ term_id: 1, start_date: "2026-11-10", end_date: "2026-11-20", weightage: 1, ...exam }));
  const classrooms = [{ id: 1, grade_name: "Grade 5", section: "A" }, { id: 2, grade_name: "Grade 6", section: "B" }];
  const assignments = subjects.map((subject, index) => ({ id: index + 1, classroom_id: index < 7 ? 1 : 2,
    subject_id: subject.id, subject_name: subject.name, teacher_member_id: null }));
  const paper = (id, subjectId, values = {}) => ({ id, exam_id: 1, classroom_id: 1, subject_id: subjectId,
    total_marks: 50, pass_marks: 20, exam_name: exams[0].name, classroom_name: "Grade 5 A",
    subject_name: subjects.find((subject) => subject.id === subjectId).name, ...values });
  const papers = names.slice(0, existing).map((_, index) => paper(index + 1, index + 1));
  const writes = [], counts = {};
  await context.addInitScript((actor) => localStorage.setItem("auth-storage", JSON.stringify({ state: {
    user: actor, token: "fixture-only", expiresAt: Date.now() + 3_600_000,
  }, version: 0 })), user);
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === frontend && request.method() === "GET") return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    counts[pathname] = (counts[pathname] || 0) + 1;
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers });
    if (request.method() === "GET") {
      if (pathname === "/auth/me") return json(user);
      if (pathname === "/exam-papers") return json(papers);
      if (pathname === "/exams") return json(exams);
      if (pathname === "/classes") return json(classrooms);
      if (pathname === "/subjects") return json(subjects);
      if (pathname === "/subjects/assignments") return assignmentError
        ? json({ detail: "Assigned subjects could not be loaded" }, 503) : json(assignments);
      return route.abort();
    }
    if (pathname === "/exam-papers/bulk" && request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push({ method: "POST", path: pathname, body });
      assert.equal(role, "admin");
      if (saveError) return json({ detail: "Exam is published; reopen it before adding papers" }, 409);
      const created = [], skipped = [];
      for (const item of body.papers) {
        const found = papers.find((row) => row.exam_id === body.exam_id && row.classroom_id === body.classroom_id && row.subject_id === item.subject_id);
        if (found) skipped.push(found);
        else {
          const added = paper(papers.length + 1, item.subject_id, { ...item, exam_id: body.exam_id, classroom_id: body.classroom_id });
          papers.push(added);
          created.push(added);
        }
      }
      return json({ created_count: created.length, skipped_count: skipped.length, created, skipped });
    }
    if (pathname === "/exam-papers" && request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push({ method: "POST", path: pathname, body });
      const added = paper(papers.length + 1, body.subject_id, body);
      papers.push(added);
      return json(added, 201);
    }
    if (/^\/exam-papers\/\d+$/.test(pathname) && request.method() === "PUT") {
      const body = request.postDataJSON();
      writes.push({ method: "PUT", path: pathname, body });
      const found = papers.find((row) => row.id === Number(pathname.split("/").at(-1)));
      Object.assign(found, body);
      return json(found);
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + "/exams/exam_paper");
  await page.getByRole("heading", { name: "Exam Papers", exact: true }).waitFor();
  const open = async () => {
    await page.getByRole("button", { name: "Add Multiple Papers", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Multiple Papers", exact: true });
    await dialog.getByLabel("Examination", { exact: true }).selectOption("1");
    await dialog.getByLabel("Classroom", { exact: true }).selectOption("1");
    await dialog.getByRole("checkbox", { name: "Select Mathematics", exact: true }).waitFor();
    return dialog;
  };
  return { page, writes, counts, papers, open };
}

async function fillNewMarks(dialog, start = 0) {
  for (const [index, name] of names.entries()) {
    if (index < start) continue;
    await dialog.getByLabel(`Total marks for ${name}`, { exact: true }).fill(String(100 + index * 10));
    await dialog.getByLabel(`Pass marks for ${name}`, { exact: true }).fill("40");
  }
}

test("loads assigned subjects on demand, preserves blank marks, and supports selection controls", async (t) => {
  const { counts, open } = await fixture(t);
  assert.equal(counts["/subjects/assignments"] || 0, 0);
  const dialog = await open();
  assert.equal(counts["/subjects/assignments"], 1);
  assert.equal(await dialog.getByRole("checkbox").count(), 7);
  assert.equal(await dialog.getByRole("checkbox", { name: "Select Art", exact: true }).count(), 0);
  assert.equal(await dialog.getByLabel("Total marks for Mathematics", { exact: true }).inputValue(), "");
  assert.equal(await dialog.getByLabel("Pass marks for Mathematics", { exact: true }).inputValue(), "");
  await dialog.getByRole("button", { name: "Select All", exact: true }).click();
  for (const name of names) assert.equal(await dialog.getByRole("checkbox", { name: `Select ${name}`, exact: true }).isChecked(), true);
  await dialog.getByRole("button", { name: "Deselect All", exact: true }).click();
  for (const name of names) assert.equal(await dialog.getByRole("checkbox", { name: `Select ${name}`, exact: true }).isChecked(), false);
});

test("previews and creates seven papers with one bulk request, then refreshes the table", async (t) => {
  const { page, counts, writes, open } = await fixture(t);
  const dialog = await open();
  await dialog.getByRole("button", { name: "Select All", exact: true }).click();
  await fillNewMarks(dialog);
  await dialog.getByRole("button", { name: "Preview Papers", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm and Create", exact: true }).waitFor();
  assert.equal(writes.length, 0);
  assert.match(await dialog.innerText(), /First Term Examination/);
  const originalLoads = counts["/exam-papers"];
  await dialog.getByRole("button", { name: "Confirm and Create", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/exam-papers/bulk");
  assert.equal(writes[0].body.exam_id, 1);
  assert.equal(writes[0].body.classroom_id, 1);
  assert.deepEqual(writes[0].body.papers, names.map((_, index) => ({ subject_id: index + 1, total_marks: 100 + index * 10, pass_marks: 40 })));
  assert.ok(counts["/exam-papers"] > originalLoads);
  await page.getByText("Mathematics", { exact: true }).filter({ visible: true }).waitFor();
});

test("existing papers keep their marks and are reported as skipped", async (t) => {
  const { page, papers, writes, open } = await fixture(t, { existing: 2 });
  const original = structuredClone(papers);
  const dialog = await open();
  assert.match(await dialog.innerText(), /already exists|existing|will be skipped/i);
  await dialog.getByRole("button", { name: "Select All", exact: true }).click();
  await fillNewMarks(dialog, 2);
  await dialog.getByRole("button", { name: "Preview Papers", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm and Create", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(writes.length, 1);
  assert.equal(papers.length, 7);
  assert.deepEqual(papers.slice(0, 2), original);
  const status = page.getByRole("status").filter({ hasText: /created|skipped/i });
  await status.waitFor();
  assert.match(await status.innerText(), /5.*created|created.*5/i);
  assert.match(await status.innerText(), /2.*skipped|skipped.*2/i);
});

test("invalid or missing marks do not reach preview or the API", async (t) => {
  const { writes, open } = await fixture(t);
  const dialog = await open();
  await dialog.getByRole("checkbox", { name: "Select Mathematics", exact: true }).check();
  for (const [total, pass] of [["", ""], ["0", "0"], ["100", "-1"], ["100", "101"], ["100.5", "40"]]) {
    await dialog.getByLabel("Total marks for Mathematics", { exact: true }).fill(total);
    await dialog.getByLabel("Pass marks for Mathematics", { exact: true }).fill(pass);
    const preview = dialog.getByRole("button", { name: "Preview Papers", exact: true });
    if (!(await preview.isDisabled())) await preview.click();
    assert.equal(await dialog.getByRole("button", { name: "Confirm and Create", exact: true }).count(), 0);
  }
  assert.equal(writes.length, 0);
});

test("returning from preview preserves drafts and sends no request", async (t) => {
  const { writes, open } = await fixture(t);
  const dialog = await open();
  await dialog.getByRole("checkbox", { name: "Select Mathematics", exact: true }).check();
  await dialog.getByLabel("Total marks for Mathematics", { exact: true }).fill("80");
  await dialog.getByLabel("Pass marks for Mathematics", { exact: true }).fill("32");
  await dialog.getByRole("button", { name: "Preview Papers", exact: true }).click();
  await dialog.getByRole("button", { name: "Back to editing", exact: true }).click();
  assert.equal(writes.length, 0);
  assert.equal(await dialog.getByLabel("Total marks for Mathematics", { exact: true }).inputValue(), "80");
});

test("switching classroom resets subjects and avoids retargeting old drafts", async (t) => {
  const { writes, open } = await fixture(t);
  const dialog = await open();
  await dialog.getByRole("checkbox", { name: "Select Mathematics", exact: true }).check();
  await dialog.getByLabel("Total marks for Mathematics", { exact: true }).fill("100");
  await dialog.getByLabel("Classroom", { exact: true }).selectOption("2");
  await dialog.getByRole("checkbox", { name: "Select Art", exact: true }).check();
  assert.equal(await dialog.getByRole("checkbox", { name: "Select Mathematics", exact: true }).count(), 0);
  assert.equal(await dialog.getByLabel("Total marks for Art", { exact: true }).inputValue(), "");
  await dialog.getByLabel("Total marks for Art", { exact: true }).fill("50");
  await dialog.getByLabel("Pass marks for Art", { exact: true }).fill("20");
  await dialog.getByRole("button", { name: "Preview Papers", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm and Create", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(writes[0].body, { exam_id: 1, classroom_id: 2, papers: [{ subject_id: 8, total_marks: 50, pass_marks: 20 }] });
});

test("locked and published exams cannot be chosen for bulk creation", async (t) => {
  const { writes, open } = await fixture(t);
  const dialog = await open();
  const locked = dialog.getByRole("option", { name: /Locked Examination/ });
  const published = dialog.getByRole("option", { name: /Published Examination/ });
  assert.equal(await locked.evaluate((element) => element.disabled), true);
  assert.equal(await published.evaluate((element) => element.disabled), true);
  assert.equal(writes.length, 0);
});

test("unauthorized users do not receive the bulk-create action", async (t) => {
  const { page } = await fixture(t, { role: "teacher" });
  await page.getByText("No exam papers yet", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add Multiple Papers", exact: true }).count(), 0);
});

test("a failed save retains the subject marks and shows the server message", async (t) => {
  const { writes, open } = await fixture(t, { saveError: true });
  const dialog = await open();
  await dialog.getByRole("checkbox", { name: "Select Mathematics", exact: true }).check();
  await dialog.getByLabel("Total marks for Mathematics", { exact: true }).fill("90");
  await dialog.getByLabel("Pass marks for Mathematics", { exact: true }).fill("36");
  await dialog.getByRole("button", { name: "Preview Papers", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm and Create", exact: true }).click();
  await dialog.getByText(/Exam is published; reopen it before adding papers/).waitFor();
  assert.equal(writes.length, 1);
  const back = dialog.getByRole("button", { name: "Back to editing", exact: true });
  if (await back.count()) await back.click();
  assert.equal(await dialog.getByLabel("Total marks for Mathematics", { exact: true }).inputValue(), "90");
});

test("assignment-load failures block saving and offer retry", async (t) => {
  const { page, writes } = await fixture(t, { assignmentError: true });
  await page.getByRole("button", { name: "Add Multiple Papers", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Multiple Papers", exact: true });
  await dialog.getByText("Unable to load assigned subjects.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: /retry/i }).waitFor();
  assert.equal(writes.length, 0);
});

test("the bulk table fits a mobile dark viewport with horizontal scrolling", async (t) => {
  const { page, open } = await fixture(t, { mobile: true });
  const dialog = await open();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await dialog.evaluate((element) => element.getBoundingClientRect().width <= innerWidth));
  assert.equal(await dialog.getByRole("checkbox").count(), 7);
  assert.ok(await dialog.locator('section[aria-label="Assigned subjects"] table').evaluate((element) => {
    const container = element.parentElement;
    return container.scrollWidth > container.clientWidth;
  }), "The subject table must scroll inside the mobile dialog.");
});

test("existing single-paper creation and editing remain available", async (t) => {
  const { page, writes } = await fixture(t);
  await page.getByRole("button", { name: "Add Exam Paper", exact: true }).first().click();
  const create = page.getByRole("dialog", { name: "Add Exam Paper", exact: true });
  await create.getByLabel(/^Exam/).selectOption("1");
  await create.getByLabel(/^Classroom/).selectOption("1");
  await create.getByLabel(/^Subject/).selectOption("1");
  await create.getByRole("button", { name: "Create Paper", exact: true }).click();
  await create.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Edit paper", exact: true }).filter({ visible: true }).first().click();
  const edit = page.getByRole("dialog", { name: "Edit Exam Paper", exact: true });
  await edit.getByLabel(/^Total Marks/).fill("120");
  await edit.getByRole("button", { name: "Update Paper", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  assert.deepEqual(writes.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/exam-papers" }, { method: "PUT", path: "/exam-papers/1" },
  ]);
  assert.deepEqual(writes[1].body, { total_marks: 120, pass_marks: 40 });
});
