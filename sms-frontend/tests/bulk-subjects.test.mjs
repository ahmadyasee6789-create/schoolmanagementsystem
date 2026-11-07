// Local UI fixtures only. No API request reaches a real school database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
const names = ["Mathematics", "English", "Urdu", "Science", "Computer", "Islamiat", "Social Studies"];
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, { assignmentPage = false, role = "admin", initialNames = [], existingAssignments = 0, fail = false, mobile = false, removeFailure = false, holdRemove = false } = {}) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1200, height: 900 }, serviceWorkers: "block" });
  t.after(() => context.close());
  const user = { id: 1, org_id: 1, org_role: role, full_name: "Fixture User", email: "fixture@example.invalid" };
  const subjects = initialNames.map((name, index) => ({ id: index + 1, name }));
  const assignments = subjects.slice(0, existingAssignments).map((subject, index) => ({ id: 32 + index, classroom_id: 5,
    subject_id: subject.id, subject_name: subject.name, classroom_name: "Grade 5", section: "A", teacher_member_id: 9 }));
  const writes = [], reads = [];
  let releaseRemove;
  const removeGate = new Promise(resolve => { releaseRemove = resolve; });
  t.after(() => releaseRemove());
  await context.addInitScript((actor) => localStorage.setItem("auth-storage", JSON.stringify({ state: {
    user: actor, token: "fixture-only", expiresAt: Date.now() + 3_600_000,
  }, version: 0 })), user);
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === frontend && request.method() === "GET") return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers });
    if (request.method() === "GET") {
      reads.push(url.pathname + url.search);
      if (url.pathname === "/auth/me") return json(user);
      if (url.pathname === "/subjects") {
        const skip = Number(url.searchParams.get("skip") || 0), limit = Number(url.searchParams.get("limit") || 100);
        return json(subjects.slice(skip, skip + limit));
      }
      if (url.pathname === "/sessions/active") return json({ id: 42, name: "Fixture Session" });
      if (url.pathname === "/classes") {
        assert.equal(url.searchParams.get("session_id"), "42");
        return json([{ id: 5, grade_name: "Grade 5", class_name: "Grade 5", section: "A" }]);
      }
      if (url.pathname === "/subjects/assignments") return json(assignments);
      return route.abort();
    }
    const body = request.postData() ? request.postDataJSON() : undefined;
    writes.push({ path: url.pathname, method: request.method(), body });
    if (fail) return json({ detail: [{ msg: "Fixture validation failure" }] }, 422);
    if (/^\/subjects\/assignments\/\d+$/.test(url.pathname) && request.method() === 'DELETE') {
      if (holdRemove) await removeGate;
      if (removeFailure) return json({ detail: 'Assignment not found' }, 404);
      const id = Number(url.pathname.split('/').at(-1));
      const index = assignments.findIndex(item => item.id === id);
      if (index === -1) return json({ detail: 'Assignment not found' }, 404);
      assignments.splice(index, 1);
      return route.fulfill({ status: 204, headers });
    }
    if (url.pathname === "/subjects/bulk") {
      const created = [], skipped = [], seen = new Set();
      for (const raw of body.names) {
        const name = raw.trim(), key = name.toLowerCase();
        if (seen.has(key) || subjects.some((subject) => subject.name.trim().toLowerCase() === key)) skipped.push(name);
        else { const subject = { id: subjects.length + 1, name }; subjects.push(subject); created.push(subject); }
        seen.add(key);
      }
      return json({ created_count: created.length, skipped_count: skipped.length, created, skipped });
    }
    if (url.pathname === "/subjects/assign-to-class/bulk") {
      const assigned = [], skipped = [];
      for (const id of body.subject_ids) {
        if (assignments.some((item) => item.classroom_id === body.classroom_id && item.subject_id === id)) skipped.push(id);
        else {
          const subject = subjects.find((item) => item.id === id);
          const assignment = { id: assignments.length + 1, classroom_id: body.classroom_id, subject_id: id,
            subject_name: subject.name, classroom_name: "Grade 5", section: "A", teacher_member_id: null };
          assignments.push(assignment); assigned.push(assignment);
        }
      }
      return json({ assigned_count: assigned.length, skipped_count: skipped.length, assigned, skipped });
    }
    if (url.pathname === "/subjects/assign-to-class") {
      const assignment = { id: assignments.length + 1, ...body, classroom_name: "Grade 5", section: "A", subject_name: subjects.find((item) => item.id === body.subject_id).name };
      assignments.push(assignment); return json(assignment);
    }
    if (url.pathname === "/subjects" && request.method() === "POST") {
      const subject = { id: subjects.length + 1, ...body }; subjects.push(subject); return json(subject);
    }
    if (/^\/subjects\/\d+$/.test(url.pathname)) {
      const index = subjects.findIndex((item) => item.id === Number(url.pathname.split("/").at(-1)));
      if (request.method() === "PUT") { Object.assign(subjects[index], body); return json(subjects[index]); }
      if (request.method() === "DELETE") { subjects.splice(index, 1); return json({ message: "Deleted" }); }
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(45000);
  page.on("dialog", (dialog) => void dialog.accept());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + (assignmentPage ? "/academics/assign_subjects" : "/academics/add_subjects"));
  await page.getByRole("heading", { name: assignmentPage ? "Class Subjects" : "Subjects", exact: true }).waitFor();
  return { page, subjects, assignments, writes, reads, releaseRemove };
}

test("seven subjects are previewed and created with one request", async (t) => {
  const { page, writes, subjects, reads } = await fixture(t);
  await page.getByRole("button", { name: "Add Multiple Subjects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Multiple Subjects", exact: true });
  await dialog.getByLabel("Subject names", { exact: true }).fill(names.join("\n"));
  await dialog.getByRole("button", { name: "Preview Subjects", exact: true }).click();
  await dialog.getByText("7 to create · 0 to skip", { exact: true }).waitFor();
  assert.equal(writes.length, 0);
  await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body, { names });
  assert.equal(subjects.length, 7);
  assert.ok(reads.filter((path) => path.startsWith("/subjects?")).length >= 2);
});

test("preview distinguishes duplicates and existing names without changing them", async (t) => {
  const { page, writes, subjects } = await fixture(t, { initialNames: ["English"] });
  await page.getByRole("button", { name: "Add Multiple Subjects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Multiple Subjects", exact: true });
  await dialog.getByLabel("Subject names", { exact: true }).fill(" Mathematics \n english \nMATHEMATICS\nScience");
  await dialog.getByRole("button", { name: "Preview Subjects", exact: true }).click();
  await dialog.getByText("2 to create · 2 to skip", { exact: true }).waitFor();
  await dialog.getByText("Already exists", { exact: true }).waitFor();
  await dialog.getByText("Duplicate in this list", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(writes.length, 1);
  assert.deepEqual(subjects[0], { id: 1, name: "English" });
  assert.equal(subjects.length, 3);
});

test("bulk assignment preserves existing teachers and supports selection controls", async (t) => {
  const { page, assignments, writes, reads } = await fixture(t, { assignmentPage: true, initialNames: names, existingAssignments: 2 });
  const before = structuredClone(assignments);
  await page.getByRole("button", { name: "Assign Multiple Subjects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Assign Multiple Subjects", exact: true });
  await dialog.getByLabel("Classroom", { exact: true }).selectOption("5");
  assert.equal(await dialog.getByText("Already assigned · Skip", { exact: true }).count(), 2);
  await dialog.getByRole("button", { name: "Select All", exact: true }).click();
  await dialog.getByRole("button", { name: "Deselect All", exact: true }).click();
  assert.equal(await dialog.getByRole("checkbox").evaluateAll((items) => items.every((item) => !item.checked)), true);
  await dialog.getByRole("button", { name: "Select All", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview Assignments", exact: true }).click();
  await dialog.getByText("5 to assign · 2 to skip", { exact: true }).waitFor();
  assert.equal(writes.length, 0);
  await dialog.getByRole("button", { name: "Confirm Assignments", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(writes[0].body, { classroom_id: 5, subject_ids: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(assignments.length, 7);
  assert.deepEqual(assignments.slice(0, 2), before);
  assert.ok(reads.filter((path) => path === "/subjects/assignments").length >= 2);
});

test("assignment selection includes subjects beyond the old first page", async (t) => {
  const { page, reads } = await fixture(t, { assignmentPage: true, initialNames: Array.from({ length: 201 }, (_, index) => `Subject ${index + 1}`) });
  await page.getByRole("button", { name: "Assign Multiple Subjects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Assign Multiple Subjects", exact: true });
  await dialog.getByLabel("Classroom", { exact: true }).selectOption("5");
  await dialog.getByRole("checkbox", { name: "Select Subject 201", exact: true }).check();
  assert.ok(reads.some((path) => path.includes("skip=200")));
});

test("invalid names block preview and failed saves retain entered names", async (t) => {
  const { page, writes } = await fixture(t, { fail: true });
  await page.getByRole("button", { name: "Add Multiple Subjects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Multiple Subjects", exact: true });
  await dialog.getByLabel("Subject names", { exact: true }).fill("x".repeat(101));
  await dialog.getByRole("button", { name: "Preview Subjects", exact: true }).click();
  assert.equal(await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).count(), 0);
  await dialog.getByLabel("Subject names", { exact: true }).fill("English");
  await dialog.getByRole("button", { name: "Preview Subjects", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Fixture validation failure" }).waitFor();
  await dialog.getByRole("button", { name: "Back to editing", exact: true }).click();
  assert.equal(await dialog.getByLabel("Subject names", { exact: true }).inputValue(), "English");
  assert.equal(writes.length, 1);
});

test("manager retains single workflows but has no administrator bulk actions", async (t) => {
  const { page } = await fixture(t, { role: "manager" });
  await page.getByRole("button", { name: "Add Subject", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add Multiple Subjects", exact: true }).count(), 0);
  await page.goto(frontend + "/academics/assign_subjects");
  await page.getByRole("button", { name: "Assign Subject", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Assign Multiple Subjects", exact: true }).count(), 0);
});

test("existing single subject creation and editing still work", async (t) => {
  const { page, writes } = await fixture(t);
  await page.getByRole("button", { name: "Add Subject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add New Subject", exact: true });
  await dialog.getByLabel(/Subject Name/).fill("English");
  await dialog.getByRole("button", { name: "Create Subject", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Edit English", exact: true }).filter({ visible: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Subject", exact: true });
  await edit.getByLabel(/Subject Name/).fill("Literature");
  await edit.getByRole("button", { name: "Update Subject", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  assert.deepEqual(writes.map((item) => item.method), ["POST", "PUT"]);
});

test('removal confirms and sends assignment ID 32 rather than subject ID 1, then refreshes', async t => {
  const { page, subjects, assignments, writes, reads, releaseRemove } = await fixture(t, {
    assignmentPage: true, initialNames: ['Mathematics'], existingAssignments: 1, holdRemove: true,
  });
  const remove = page.getByRole('button', { name: 'Remove Mathematics assignment from Grade 5 A', exact: true }).filter({ visible: true });
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Remove assignment?', exact: true });
  await dialog.waitFor();
  assert.equal(writes.length, 0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(writes.length, 0);
  await remove.click();
  const requested = page.waitForRequest(request => request.method() === 'DELETE');
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await requested;
  assert.equal(await dialog.getByRole('button', { name: 'Removing…', exact: true }).isDisabled(), true);
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/subjects/assignments' && response.request().method() === 'GET');
  releaseRemove();
  await refreshed;
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('Assignment removed', { exact: true }).waitFor();
  assert.deepEqual(writes, [{ path: '/subjects/assignments/32', method: 'DELETE', body: undefined }]);
  assert.equal(assignments.length, 0);
  assert.deepEqual(subjects, [{ id: 1, name: 'Mathematics' }]);
  assert.ok(reads.filter(path => path === '/subjects/assignments').length >= 2);
});

test('failed removal keeps the assignment and confirmation open without claiming success', async t => {
  const { page, assignments, writes } = await fixture(t, { assignmentPage: true, initialNames: ['English'], existingAssignments: 1, removeFailure: true });
  await page.getByRole('button', { name: 'Remove English assignment from Grade 5 A', exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove assignment?', exact: true });
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Assignment not found' }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Remove', exact: true }).isEnabled(), true);
  assert.equal(assignments.length, 1);
  assert.equal(writes[0].path, '/subjects/assignments/32');
  assert.equal(await page.getByText('Assignment removed', { exact: true }).count(), 0);
});

test('managers can remove on mobile while teachers have no removal controls', async t => {
  const { page } = await fixture(t, { assignmentPage: true, role: 'manager', initialNames: ['English'], existingAssignments: 1, mobile: true });
  await page.getByRole('button', { name: 'Remove English assignment from Grade 5 A', exact: true }).filter({ visible: true }).click();
  await page.getByRole('dialog', { name: 'Remove assignment?', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText('Assignment removed', { exact: true }).waitFor();
  const teacher = await fixture(t, { assignmentPage: true, role: 'teacher', initialNames: ['English'], existingAssignments: 1 });
  await teacher.page.getByText('English', { exact: true }).filter({ visible: true }).waitFor();
  assert.equal(await teacher.page.getByRole('button', { name: /^Remove .* assignment from/ }).count(), 0);
});

test("existing single assignment still works", async (t) => {
  const { page, writes, assignments } = await fixture(t, { assignmentPage: true, initialNames: names });
  await page.getByRole("button", { name: "Assign Subject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Assign Subject to Class", exact: true });
  await dialog.getByLabel(/^Class/).selectOption("5");
  await dialog.getByLabel(/^Subject/).selectOption("1");
  await dialog.getByRole("button", { name: "Assign Subject", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(writes, [{ path: "/subjects/assign-to-class", method: "POST", body: { classroom_id: 5, subject_id: 1 } }]);
  assert.equal(assignments.length, 1);
});

test("bulk subject previews fit a mobile dark viewport", async (t) => {
  const { page } = await fixture(t, { mobile: true });
  await page.getByRole("button", { name: "Add Multiple Subjects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Multiple Subjects", exact: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await dialog.getByLabel("Subject names", { exact: true }).fill("A".repeat(100));
  await dialog.getByRole("button", { name: "Preview Subjects", exact: true }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await dialog.evaluate((element) => element.getBoundingClientRect().width <= innerWidth));
});
