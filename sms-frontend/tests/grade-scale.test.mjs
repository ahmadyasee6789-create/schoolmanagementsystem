// Local UI tests. Every API request is intercepted; no school data is changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
const initial = { id: 1, grade: "Upper", min_percentage: 40, max_percentage: 100, gpa: 4 };

async function fixture(t, { role = "admin", locked = false, rows = [initial], failLoad = false, rejectSave = false, mobile = false } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1200, height: 850 } });
  const user = { id: 91, org_id: 7, org_role: role, full_name: "Fixture User", email: "fixture@example.invalid" };
  await context.addInitScript(({ user, mobile }) => {
    localStorage.setItem("auth-storage", JSON.stringify({ state: { user, token: "fixture-only", expiresAt: Date.now() + 3_600_000 }, version: 0 }));
    if (mobile) localStorage.setItem("theme-mode", "dark");
  }, { user, mobile });
  let items = structuredClone(rows);
  let rejected = false;
  let loadFailures = failLoad ? 2 : 0;
  const requests = [];
  const cors = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === frontend) return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/me") return route.fulfill({ json: user, headers: cors });
    if (!url.pathname.startsWith("/grade-scales")) return route.abort();
    const body = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ method: request.method(), path: url.pathname, body });
    if (request.method() === "GET") {
      if (loadFailures > 0) { loadFailures--; return route.fulfill({ status: 503, json: { detail: "Synthetic grade service unavailable" }, headers: cors }); }
      const complete = items.some((row) => row.min_percentage === 0) && items.some((row) => row.max_percentage === 100);
      return route.fulfill({ headers: cors, json: { items, complete, gaps: complete ? [] : [{ minimum: 0, maximum: 39.99 }], issues: [],
        can_manage: role === "admin" && !locked, history_locked: locked, require_complete_for_finalization: true } });
    }
    if (rejectSave && !rejected) {
      rejected = true;
      return route.fulfill({ status: 409, json: { detail: "This range overlaps grade Upper" }, headers: cors });
    }
    assert.equal(role, "admin"); assert.equal(locked, false);
    if (body) assert.deepEqual(Object.keys(body).sort(), ["gpa", "grade", "max_percentage", "min_percentage"]);
    if (request.method() === "POST") {
      const row = { id: 2, ...body }; items.push(row);
      return route.fulfill({ status: 201, json: row, headers: cors });
    }
    const id = Number(url.pathname.split("/").at(-1));
    if (request.method() === "PUT") {
      const row = { id, ...body }; items = items.map((previous) => previous.id === id ? row : previous);
      return route.fulfill({ json: row, headers: cors });
    }
    assert.equal(request.method(), "DELETE");
    items = items.filter((row) => row.id !== id);
    return route.fulfill({ status: 204, headers: cors });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + "/exams/grade-scale");
  return { page, requests };
}

async function fill(page, { grade = "Lower", low = "0", high = "39.99", gpa = "1.25" } = {}) {
  await page.getByLabel("Grade label", { exact: true }).fill(grade);
  await page.getByLabel("Minimum percentage", { exact: true }).fill(low);
  await page.getByLabel("Maximum percentage", { exact: true }).fill(high);
  await page.getByLabel("GPA (optional)", { exact: true }).fill(gpa);
}

test("administrator can add, edit, and confirm deletion using scoped payloads", async (t) => {
  const { page, requests } = await fixture(t);
  await page.getByText("Coverage needs attention", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add Grade", exact: true }).click();
  await fill(page);
  await page.getByRole("button", { name: "Save Grade", exact: true }).click();
  await page.getByText("Grade range added.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit grade Lower", exact: true }).click();
  assert.equal(await page.getByLabel("GPA (optional)", { exact: true }).inputValue(), "1.25");
  await page.getByLabel("Grade label", { exact: true }).fill("Developing");
  await page.getByRole("button", { name: "Save Grade", exact: true }).click();
  await page.getByText("Grade range updated.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Delete grade Developing", exact: true }).click();
  assert.equal(requests.filter((request) => request.method === "DELETE").length, 0);
  await page.getByRole("button", { name: "Delete Grade", exact: true }).click();
  await page.getByText("Grade range deleted.", { exact: true }).waitFor();
  assert.deepEqual(requests.filter((request) => request.method !== "GET").map((request) => request.method), ["POST", "PUT", "DELETE"]);
});

test("teachers can view grading rules without modification controls", async (t) => {
  const { page, requests } = await fixture(t, { role: "teacher" });
  await page.getByText("Only school administrators can change grade ranges.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add Grade", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Edit grade Upper", exact: true }).count(), 0);
  assert.equal(requests.filter((request) => request.method !== "GET").length, 0);
});

test("historical grading protection disables admin edits and explains why", async (t) => {
  const { page, requests } = await fixture(t, { locked: true });
  await page.getByText(/Grade scales are read-only to protect historical DMC reprints/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add Grade", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Edit grade Upper", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Delete grade Upper", exact: true }).isDisabled(), true);
  assert.equal(requests.filter((request) => request.method !== "GET").length, 0);
});

test("invalid ranges stay in the dialog and server conflicts retain edits", async (t) => {
  const { page, requests } = await fixture(t, { rejectSave: true });
  await page.getByRole("button", { name: "Add Grade", exact: true }).click();
  await fill(page, { low: "70", high: "60" });
  await page.getByRole("button", { name: "Save Grade", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Minimum percentage cannot exceed" }).waitFor();
  assert.equal(requests.filter((request) => request.method === "POST").length, 0);
  await fill(page);
  await page.getByRole("button", { name: "Save Grade", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "This range overlaps grade Upper" }).waitFor();
  assert.equal(await page.getByLabel("Grade label", { exact: true }).inputValue(), "Lower");
  await page.getByRole("button", { name: "Save Grade", exact: true }).click();
  await page.getByText("Grade range added.", { exact: true }).waitFor();
});

test("empty and failed-load states offer useful actions", async (t) => {
  const { page } = await fixture(t, { rows: [], failLoad: true });
  await page.getByRole("alert").filter({ hasText: "Synthetic grade service unavailable" }).waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Add your first grade", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add your first grade", exact: true }).click();
  await page.getByRole("dialog", { name: "Add Grade", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
});

test("Grade Scale is in Examinations and its table fits a dark mobile viewport", async (t) => {
  const desktop = await fixture(t);
  await desktop.page.getByRole("button", { name: "Examinations", exact: true }).filter({ visible: true }).click();
  await desktop.page.getByRole("link", { name: "Grade Scale", exact: true }).filter({ visible: true }).waitFor();
  const { page } = await fixture(t, { mobile: true });
  await page.getByRole("columnheader", { name: "Minimum (%)", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
});
