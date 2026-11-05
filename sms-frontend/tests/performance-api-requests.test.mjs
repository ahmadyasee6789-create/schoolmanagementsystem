// Local browser regressions. Every backend request is intercepted with fixtures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
const actor = { id: 91, org_id: 7, org_role: "admin", full_name: "Fixture Admin", email: "fixture@example.invalid" };
const dashboard = {
  overview: { students: { total: 1, active: 1, inactive: 0 }, faculty: 0, classes: 1, studentsPerClass: [] },
  attendance: { total: 1, present: 0, absent: 0, percentage: 0, marked: false },
  financials: { year: 2026, revenue: { yearTotal: 0 }, expenses: { yearTotal: 0, salaryYearTotal: 0, pendingSalaryTotal: 0, combinedYearTotal: 0 },
    net: { yearTotal: 0 }, monthlyComparison: [] },
};

async function fixturePage(t, { refreshSoon = false, oldCache = false } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.addInitScript(({ actor, refreshSoon, oldCache, dashboard }) => {
    localStorage.setItem("auth-storage", JSON.stringify({ state: {
      user: actor, token: "fixture-only", expiresAt: Date.now() + (refreshSoon ? 65_000 : 3_600_000),
      refreshToken: refreshSoon ? "fixture-refresh" : null,
    }, version: 0 }));
    if (oldCache) localStorage.setItem("dashboard_stats", JSON.stringify({ ...dashboard,
      overview: { ...dashboard.overview, students: { total: 987654, active: 987654, inactive: 0 } },
    }));
  }, { actor, refreshSoon, oldCache, dashboard });
  const counts = {};
  const expenseRequests = [];
  const cors = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const { origin, pathname } = new URL(request.url());
    if (origin === frontend) return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    counts[pathname] = (counts[pathname] || 0) + 1;
    if (pathname === "/auth/refresh") return route.fulfill({ json: { access_token: "refreshed-fixture", refresh_token: "rotated-fixture", expires_in: 3600 }, headers: cors });
    assert.equal(request.method(), "GET");
    if (pathname === "/auth/me") return route.fulfill({ json: actor, headers: cors });
    if (pathname === "/dashboard/stats") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return route.fulfill({ json: dashboard, headers: cors });
    }
    if (pathname === "/sessions/active") return route.fulfill({ json: { id: 1, name: "Fixture Session" }, headers: cors });
    if (["/exams", "/terms"].includes(pathname)) return route.fulfill({ json: [], headers: cors });
    if (pathname === "/expenses/categories") return route.fulfill({ json: [], headers: cors });
    if (pathname === "/expenses") {
      const params = new URL(request.url()).searchParams;
      expenseRequests.push({ page: params.get("page"), search: params.get("search") });
      return route.fulfill({ json: { data: [{ id: 1, category_id: 1, category: { id: 1, name: "Supplies" },
        description: "Fixture books", amount: 100, created_at: "2026-11-05" }], totalPages: 2 }, headers: cors });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { page, counts, expenseRequests };
}

test("Dashboard fetches once and ignores an unscoped legacy financial cache", async (t) => {
  const { page, counts } = await fixturePage(t, { oldCache: true });
  await page.goto(frontend);
  await page.getByText("Total Students", { exact: true }).waitFor();
  assert.equal(await page.getByText("987654", { exact: true }).count(), 0);
  console.log("Dashboard requests", JSON.stringify(counts));
  assert.equal(counts["/dashboard/stats"], 1);
});

test("Examinations loads each setup source once", async (t) => {
  const { page, counts } = await fixturePage(t);
  await page.goto(frontend + "/exams");
  await page.getByRole("heading", { name: "Examinations", exact: true }).waitFor();
  await page.waitForTimeout(300);
  console.log("Examinations requests", JSON.stringify(counts));
  for (const path of ["/sessions/active", "/terms", "/exams"]) assert.equal(counts[path], 1, path);
});

test("A scheduled access-token refresh sends one request", async (t) => {
  const { page, counts } = await fixturePage(t, { refreshSoon: true });
  await page.goto(frontend + "/exams");
  await page.waitForTimeout(6500);
  console.log("Refresh requests", JSON.stringify(counts));
  assert.equal(counts["/auth/refresh"], 1);
});

test("The paginated expenses list makes one initial request", async (t) => {
  const { page, counts } = await fixturePage(t);
  await page.goto(frontend + "/finance/expenses");
  await page.getByRole("heading", { name: "Expenses", exact: true }).waitFor();
  await page.waitForTimeout(800);
  console.log("Expense requests", JSON.stringify(counts));
  assert.equal(counts["/expenses"], 1);
  assert.equal(counts["/expenses/categories"], 1);
});

test("Expense search is debounced and resets pagination in one request", async (t) => {
  const { page, expenseRequests } = await fixturePage(t);
  await page.goto(frontend + "/finance/expenses");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(expenseRequests.at(-1).page, "2");
  const previous = expenseRequests.length;
  await page.getByPlaceholder("Search by description…").fill("books");
  await page.waitForTimeout(800);
  assert.deepEqual(expenseRequests.slice(previous), [{ page: "1", search: "books" }]);
});
