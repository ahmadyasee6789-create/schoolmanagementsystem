// Local UI only. Every API request is intercepted; no school records are used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, { discount = 12.5, role = "admin", enrolled = true, conflict = false, mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1200, height: 900 }, serviceWorkers: "block" });
  t.after(() => context.close());
  const actor = { id: 1, org_id: 1, org_role: role, full_name: "Fixture Admin", email: "fixture@example.invalid" };
  let profile = {
    id: 1, first_name: "Fixture", last_name: "Student", admission_no: "TEST-001", gender: "female",
    date_of_birth: "2015-04-12", phone: null, email: null, father_name: "Fixture Parent", father_phone: null,
    mother_name: null, guardian_name: null, guardian_phone: null, is_active: true,
    active_session: { id: 42, name: "Fixture Session 2026–27" },
    current_enrollment: enrolled ? { id: 19, session_id: 42, session_name: "Fixture Session 2026–27", classroom_id: 5,
      class_name: "Grade 5 – A", grade_name: "Grade 5", section: "A", roll_number: "007",
      discount_percent: discount, enrollment_date: "2026-04-01", withdrawal_date: null, is_active: true } : null,
  };
  await context.addInitScript((user) => localStorage.setItem("auth-storage", JSON.stringify({ state: {
    user, token: "fixture-only", expiresAt: Date.now() + 3_600_000,
  }, version: 0 })), actor);
  const counts = {}, saves = [];
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,PUT,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === frontend && request.method() === "GET") return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    counts[pathname] = (counts[pathname] || 0) + 1;
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers });
    if (request.method() === "GET") {
      if (pathname === "/auth/me") return json(actor);
      if (pathname === "/students/1/details") return json(profile);
      if (pathname === "/fees/students/1/history") return json({ items: [], sessions: [
        { session_id: 42, session_name: "Fixture Session 2026–27", billed: "0.00", paid: "0.00", outstanding: "0.00", available_credit: "0.00" },
      ] });
      if (pathname === "/fees/students/1/payments") return json({ items: [] });
      return route.abort();
    }
    if (pathname === "/students/1" && request.method() === "PUT") {
      const body = request.postDataJSON();
      saves.push(body);
      if (body.enrollment_discount) {
        assert.equal(role, "admin");
        assert.equal(body.enrollment_discount.enrollment_id, 19);
        assert.equal(body.enrollment_discount.session_id, 42);
        assert.equal(body.enrollment_discount.confirmed, true);
        if (conflict) return json({ detail: "Enrollment discount changed since this profile was loaded. Refresh and try again." }, 409);
        profile.current_enrollment = { ...profile.current_enrollment, discount_percent: Number(body.enrollment_discount.discount_percent) };
      }
      const personal = { ...body };
      delete personal.enrollment_discount;
      profile = { ...profile, ...personal };
      const saved = { ...profile };
      delete saved.current_enrollment;
      delete saved.active_session;
      return json(saved);
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + "/students/1");
  await page.getByRole("button", { name: "Edit Student", exact: true }).waitFor();
  const open = async () => {
    await page.getByRole("button", { name: "Edit Student", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Student", exact: true });
    await dialog.getByLabel("First name", { exact: true }).waitFor();
    return dialog;
  };
  return { page, counts, saves, open };
}

test("existing enrollment values appear in the same Edit Student dialog", async (t) => {
  const { page, open } = await fixture(t);
  const dialog = await open();
  await dialog.getByText("Enrollment & Fees", { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).inputValue(), "12.5");
  assert.equal(await dialog.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(await dialog.getByLabel("Academic session", { exact: true }).inputValue(), "Fixture Session 2026–27");
  assert.equal(await dialog.getByLabel("Classroom", { exact: true }).inputValue(), "Grade 5 – A");
  assert.equal(await dialog.getByLabel("Roll number", { exact: true }).inputValue(), "007");
});

test("personal edits preserve the discount and refresh the profile without confirmation", async (t) => {
  const { page, counts, saves, open } = await fixture(t);
  const dialog = await open();
  await dialog.getByLabel("First name", { exact: true }).fill("Updated Fixture");
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(saves, [{ first_name: "Updated Fixture" }]);
  assert.ok(counts["/students/1/details"] >= 2);
  await page.getByRole("heading", { name: "Updated Fixture Student", exact: true }).waitFor();
});

for (const [from, entered, to] of [[0, "10", 10], [10, "5", 5], [10, "", 0]]) {
  test(`discount ${from}% to ${to}% needs confirmation and saves the selected enrollment`, async (t) => {
    const { saves, open } = await fixture(t, { discount: from });
    const dialog = await open();
    await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).fill(entered);
    await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
    await dialog.getByText("Confirm discount change", { exact: true }).waitFor();
    assert.equal(saves.length, 0);
    assert.match(await dialog.innerText(), /already generated|existing charges|existing obligations/i);
    await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(saves.length, 1);
    assert.deepEqual(Object.keys(saves[0]), ["enrollment_discount"]);
    assert.equal(Number(saves[0].enrollment_discount.expected_discount_percent), from);
    assert.equal(Number(saves[0].enrollment_discount.discount_percent), to);
    const reopened = await open();
    assert.equal(Number(await reopened.getByLabel("Tuition Fee Discount (%)", { exact: true }).inputValue()), to);
  });
}

test("canceling discount confirmation preserves edits and makes no request", async (t) => {
  const { saves, open } = await fixture(t, { discount: 10 });
  const dialog = await open();
  await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).fill("5");
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.equal(saves.length, 0);
  assert.equal(await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).inputValue(), "5");
});

for (const role of ["teacher", "manager"]) {
  test(`${role} can edit personal details while the enrollment discount stays read-only`, async (t) => {
    const { saves, open } = await fixture(t, { role, discount: 10 });
    const dialog = await open();
    const input = dialog.getByLabel("Tuition Fee Discount (%)", { exact: true });
    assert.ok(await input.isDisabled() || await input.getAttribute("readonly") !== null);
    await dialog.getByLabel("First name", { exact: true }).fill("Updated Fixture");
    await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(saves, [{ first_name: "Updated Fixture" }]);
  });
}

test("invalid discounts cannot be saved or confirmed", async (t) => {
  const { saves, open } = await fixture(t);
  const dialog = await open();
  for (const invalid of ["-1", "101", "10.001"]) {
    await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).fill(invalid);
    await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
    assert.equal(await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).getAttribute("aria-invalid"), "true");
    assert.equal(await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).count(), 0);
  }
  assert.equal(saves.length, 0);
});

test("a stale-discount conflict keeps the personal and discount drafts", async (t) => {
  const { saves, open } = await fixture(t, { conflict: true });
  const dialog = await open();
  await dialog.getByLabel("First name", { exact: true }).fill("Unsaved Fixture");
  await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).fill("5");
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).click();
  await dialog.getByText(/Enrollment discount changed since this profile was loaded/).waitFor();
  assert.equal(saves.length, 1);
  assert.equal(await dialog.getByLabel("First name", { exact: true }).inputValue(), "Unsaved Fixture");
  assert.equal(await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).inputValue(), "5");
});

test("saving a confirmed discount refreshes the open Fees tab", async (t) => {
  const { page, counts, open } = await fixture(t, { discount: 0 });
  await page.getByRole("tab", { name: "Fees", exact: true }).click();
  await page.getByRole("heading", { name: "Payments and receipts", exact: true }).waitFor();
  const selectedSession = page.waitForResponse((response) => new URL(response.url()).pathname === "/fees/students/1/payments");
  await page.getByRole("combobox").selectOption("42");
  await selectedSession;
  const originalHistory = counts["/fees/students/1/history"];
  const originalPayments = counts["/fees/students/1/payments"];
  const dialog = await open();
  await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  const historyReload = page.waitForResponse((response) => new URL(response.url()).pathname === "/fees/students/1/history");
  const paymentsReload = page.waitForResponse((response) => new URL(response.url()).pathname === "/fees/students/1/payments");
  await dialog.getByRole("button", { name: "Confirm and Save", exact: true }).click();
  await Promise.all([historyReload, paymentsReload]);
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => !!document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("Fees"));
  await page.getByRole("heading", { name: "Payments and receipts", exact: true }).waitFor();
  assert.ok(counts["/fees/students/1/history"] > originalHistory);
  assert.ok(counts["/fees/students/1/payments"] > originalPayments);
  assert.equal(await page.getByRole("combobox").inputValue(), "42");
});

test("without an enrollment personal editing still works on mobile", async (t) => {
  const { page, saves, open } = await fixture(t, { enrolled: false, mobile: true });
  const dialog = await open();
  await dialog.getByText("Enrollment & Fees", { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel("Tuition Fee Discount (%)", { exact: true }).count(), 0);
  await dialog.getByLabel("First name", { exact: true }).fill("Updated Fixture");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(saves, [{ first_name: "Updated Fixture" }]);
});
