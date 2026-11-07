// Local production/dev verification. School API traffic is always mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || "playwright");
const frontend = process.env.EXAM_TEST_FRONTEND || "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(frontend).hostname));
const actor = { id: 91, org_id: 7, org_role: "admin", full_name: "Fixture Admin", org_name: "PRIVATE-FIXTURE-SCHOOL", email: "fixture@example.invalid" };
const dashboard = {
  overview: { students: { total: 1, active: 1, inactive: 0 }, faculty: 0, classes: 1, studentsPerClass: [] },
  attendance: { marked: false, present: 0, absent: 0, percentage: 0 },
  financials: { year: 2026, revenue: { yearTotal: 0 }, expenses: { yearTotal: 0, salaryYearTotal: 0, pendingSalaryTotal: 0, combinedYearTotal: 0 }, net: { yearTotal: 0 }, monthlyComparison: [] },
};
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, { authenticated = false, superadmin = false, width = 1440, dark = false, reducedMotion = false } = {}) {
  const user = { ...actor, ...(superadmin ? { is_superadmin: true, org_id: undefined } : {}) };
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block", reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  t.after(() => context.close());
  await context.addInitScript(({ user, authenticated, dark }) => {
    if (authenticated) localStorage.setItem("auth-storage", JSON.stringify({ state: {
      user, token: "fixture-token", refreshToken: "fixture-refresh", expiresAt: Date.now() + 3_600_000,
    }, version: 0 }));
    localStorage.setItem("theme-mode", dark ? "dark" : "light");
    if (dark) document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("dark"), { once: true });
  }, { user, authenticated, dark });
  const calls = [];
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS" };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === frontend && request.method() === "GET") return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    calls.push({ path: url.pathname, method: request.method() });
    const json = (data) => route.fulfill({ json: data, headers });
    if (url.pathname === "/auth/me") return json(user);
    if (url.pathname === "/auth/login") return json({ user, access_token: "fixture-token", refresh_token: "fixture-refresh", expires_in: 3600, redirect: "/" });
    if (url.pathname === "/dashboard/stats") return json(dashboard);
    if (url.pathname === "/superadmin/organizations") return json([]);
    if (url.pathname === "/superadmin/stats") return json({ total: 0, active: 0, suspended: 0, expired: 0, pending: 0 });
    if (url.pathname === "/exams" || url.pathname === "/terms") return json([]);
    if (url.pathname === "/sessions/active") return json({ id: 1, name: "Fixture Session" });
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(45000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  return { page, calls };
}

test("public content and SEO are present in server HTML without authentication", async () => {
  const response = await fetch(frontend);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /School days,/);
  assert.match(html, /<h1/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:title"/);
  assert.doesNotMatch(html, /Loading session\.\.\./);
});

test("anonymous visitors see all public sections without school API requests", async (t) => {
  const { page, calls } = await fixture(t);
  await page.goto(frontend);
  await page.getByRole("heading", { level: 1, name: /School days,/ }).waitFor();
  assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  for (const id of ["features", "product", "how-it-works", "faq", "contact"]) assert.equal(await page.locator(`#${id}`).count(), 1);
  assert.equal(await page.locator('a[href="/signup"]').count(), 0);
  assert.deepEqual(calls, []);
  const booking = page.getByRole("button", { name: "Demo booking coming soon", exact: true });
  if (await booking.count()) assert.equal(await booking.isDisabled(), true);
  assert.equal(new URL(page.url()).pathname, "/");
});

test("persisted private data and dark preference do not enter the public page", async (t) => {
  const { page, calls } = await fixture(t, { authenticated: true, dark: true });
  await page.goto(frontend);
  await page.getByRole("heading", { level: 1, name: /School days,/ }).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /PRIVATE-FIXTURE-SCHOOL|Fixture Admin/);
  assert.equal(await page.locator(".schoolix-landing").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
  assert.equal(await page.evaluate(() => localStorage.getItem("theme-mode")), "dark");
  assert.deepEqual(calls, []);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Login", exact: true }).click();
  await page.waitForURL(frontend + "/dashboard");
  await page.getByText("Total Students", { exact: true }).waitFor();
  assert.equal(calls.filter((call) => call.path === "/dashboard/stats").length, 1);
  await page.getByRole("button", { name: "Overview", exact: true }).filter({ visible: true }).click();
  assert.equal(await page.getByRole("link", { name: "Dashboard", exact: true }).filter({ visible: true }).getAttribute("href"), "/dashboard");
});

test("anonymous dashboard access redirects to signin without requesting dashboard data", async (t) => {
  const { page, calls } = await fixture(t);
  await page.goto(frontend + "/dashboard");
  await page.waitForURL(frontend + "/signin");
  await page.getByRole("heading", { name: "Sign in to your account", exact: true }).waitFor();
  assert.equal(calls.filter((call) => call.path === "/dashboard/stats").length, 0);
});

test("signin normalizes the existing API root redirect to dashboard", async (t) => {
  const { page, calls } = await fixture(t);
  await page.goto(frontend + "/signin");
  await page.getByLabel("Email address", { exact: true }).fill("fixture@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(frontend + "/dashboard");
  await page.getByText("Total Students", { exact: true }).waitFor();
  assert.equal(calls.filter((call) => call.path === "/auth/login").length, 1);
});

test("signin follows the split layout and fits narrow screens without changing the saved theme", async (t) => {
  for (const width of [1440, 900, 768, 390, 320]) {
    const { page, calls } = await fixture(t, { width, dark: true, reducedMotion: true });
    await page.goto(frontend + "/signin");
    await page.getByRole("heading", { name: "Sign in to your account", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const brand = page.getByRole("complementary", { name: "About Schoolix" });
    assert.equal(await brand.getByRole("link", { name: "Schoolix home" }).locator("svg").count(), 1);
    const form = page.getByRole("region", { name: "Sign in to your account" });
    const brandBox = await brand.boundingBox();
    const formBox = await form.boundingBox();
    if (width > 900) assert.ok(formBox.x >= brandBox.width);
    else assert.ok(formBox.y >= brandBox.height);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px must not overflow`);
    assert.equal(await page.locator("main").evaluate((element) => getComputedStyle(element).colorScheme), "dark");
    assert.equal(await page.evaluate(() => localStorage.getItem("theme-mode")), "dark");
    assert.deepEqual(calls, []);
    if (process.env.SIGNIN_TEST_SCREENSHOT_DIR && [1440, 390].includes(width)) {
      await mkdir(process.env.SIGNIN_TEST_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.SIGNIN_TEST_SCREENSHOT_DIR, `signin-${width}.png`), fullPage: true });
    }
  }
});

test("signin keeps validation, accessible password controls, and existing account links", async (t) => {
  const { page, calls } = await fixture(t);
  await page.goto(frontend + "/signin");
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  const email = page.getByLabel("Email address", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  assert.equal(await submit.isDisabled(), true);
  await email.fill("invalid-email");
  await password.fill("fixture-password");
  await submit.click();
  assert.equal(await email.evaluate((element) => element.validity.typeMismatch), true);
  assert.deepEqual(calls, []);
  assert.equal(await password.getAttribute("type"), "password");
  await page.getByRole("button", { name: "Show password", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await password.getAttribute("type"), "text");
  assert.equal(await page.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Hide password" }).click();
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal(await page.getByRole("link", { name: "Forgot password?" }).getAttribute("href"), "/forgot-password");
  assert.equal(await page.getByRole("link", { name: "Create School Account" }).getAttribute("href"), "/signup");
  assert.equal(await page.getByRole("link", { name: "Explore product demo" }).getAttribute("href"), "/#product");
  await page.getByRole("link", { name: "Explore product demo" }).click();
  await page.waitForURL(frontend + "/#product");
  assert.deepEqual(calls, []);
});

test("signin shows a busy state and preserves entered values after a rejected login", async (t) => {
  const { page } = await fixture(t);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  let submissions = 0;
  await page.route("**/auth/login", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    submissions++;
    await pending;
    await route.fulfill({ status: 401, headers: { "access-control-allow-origin": frontend }, json: { detail: "Invalid email or password" } });
  });
  await page.goto(frontend + "/signin");
  await page.getByLabel("Email address", { exact: true }).fill("fixture@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const busy = page.getByRole("button", { name: "Signing in…", exact: true });
  await busy.waitFor();
  assert.equal(await busy.isDisabled(), true);
  assert.equal(await page.locator("form").getAttribute("aria-busy"), "true");
  release();
  await page.getByText("Invalid email or password", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Sign in", exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel("Email address", { exact: true }).inputValue(), "fixture@example.invalid");
  assert.equal(await page.getByLabel("Password", { exact: true }).inputValue(), "fixture-password");
  assert.equal(submissions, 1);
  assert.equal(new URL(page.url()).pathname, "/signin");
});

test("superadmins keep their own home and never load school dashboard statistics", async (t) => {
  const { page, calls } = await fixture(t, { authenticated: true, superadmin: true });
  await page.goto(frontend + "/dashboard");
  await page.waitForURL(frontend + "/superadmin");
  assert.equal(calls.filter((call) => call.path === "/dashboard/stats").length, 0);
});

test("product tabs support keyboard navigation and FAQ works without API calls", async (t) => {
  const { page, calls } = await fixture(t);
  await page.goto(frontend);
  const tab = page.getByRole("tab", { name: "Dashboard", exact: true });
  await tab.focus(); await tab.press("ArrowRight");
  await page.getByRole("tabpanel").getByText("Keep every payment in view.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Fees & receipts", exact: true }).press("ArrowRight");
  await page.getByRole("tabpanel").getByText("Give results a clear process.", { exact: true }).waitFor();
  const question = page.locator("summary").filter({ hasText: "Can our team have different access levels?" });
  await question.focus(); await question.press("Enter");
  assert.equal(await question.evaluate((element) => element.parentElement.open), true);
  assert.deepEqual(calls, []);
});

test("responsive light presentation respects reduced motion and mobile navigation", async (t) => {
  for (const width of [1440, 768, 390]) {
    const { page, calls } = await fixture(t, { width, dark: true, reducedMotion: true });
    await page.goto(frontend);
    await page.getByRole("heading", { level: 1, name: /School days,/ }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px must not overflow`);
    assert.equal(await page.locator("h1").evaluate((element) => getComputedStyle(element.parentElement).animationName), "none");
    if (process.env.LANDING_TEST_SCREENSHOT_DIR) {
      await mkdir(process.env.LANDING_TEST_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.LANDING_TEST_SCREENSHOT_DIR, `landing-${width}.png`), fullPage: true });
    }
    if (width === 390) {
      const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
      await toggle.click();
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Contact", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Open navigation", exact: true }).getAttribute("aria-expanded"), "false");
      assert.equal(new URL(page.url()).hash, "#contact");
    }
    assert.deepEqual(calls, []);
  }
});
