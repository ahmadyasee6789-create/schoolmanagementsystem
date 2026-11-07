// Visual checks run locally. Every school API response is synthetic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || 'playwright');
const frontend = process.env.EXAM_TEST_FRONTEND || 'http://127.0.0.1:3107';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(frontend).hostname));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

const schoolUser = { id: 91, org_id: 7, org_role: 'admin', full_name: 'Fixture Admin', email: 'fixture@example.invalid' };
const classroom = { id: 1, grade_id: 1, grade_name: 'Grade 5', section: 'A' };
const session = { id: 1, name: 'Fixture Session' };
const org = { id: 1, name: 'Fixture School', admin_name: 'Fixture Admin', admin_email: 'fixture@example.invalid', status: 'trial', plan: 'trial', member_count: 2, days_left: 3, created_at: '2026-11-01', trial_ends_at: '2026-11-10' };
const dashboard = {
  overview: { students: { total: 7, active: 6, inactive: 1 }, faculty: 2, classes: 1, studentsPerClass: [{ class: 'Grade 5-A', students: 7 }] },
  attendance: { total: 7, marked: true, present: 3, absent: 1, leave: 1, not_marked: 2, late: 0, other: 0, percentage: 42.86,
    date: '2026-11-07', timezone: 'Asia/Karachi', is_school_day: true, calendar_configured: true },
  financials: { year: 2026, revenue: { yearTotal: 1200 }, expenses: { yearTotal: 100, salaryYearTotal: 200, pendingSalaryTotal: 50, combinedYearTotal: 300 }, net: { yearTotal: 900 }, monthlyComparison: [] },
};

async function fixture(t, { mode = 'light', width = 1440, superadmin = false, anonymous = false, brokenStorage = false, holdAuth = false,
  attendance = dashboard.attendance, holdDashboard = false, dashboardFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  let release;
  const authGate = new Promise(resolve => { release = resolve; });
  t.after(async () => { release(); await context.close(); });
  const user = superadmin ? { ...schoolUser, is_superadmin: true, org_id: undefined } : schoolUser;
  await context.addInitScript(({ user, mode, anonymous, brokenStorage }) => {
    if (localStorage.getItem('theme-mode') === null) localStorage.setItem('theme-mode', mode);
    if (!anonymous) localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token: 'fixture-token', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3600000 }, version: 0 }));
    if (brokenStorage) {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (key === 'theme-mode') throw new Error('Storage unavailable'); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (key === 'theme-mode') throw new Error('Storage unavailable'); return set.call(this, key, value); };
    }
  }, { user, mode, anonymous, brokenStorage });
  const calls = [];
  const headers = { 'access-control-allow-origin': frontend, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === frontend && request.method() === 'GET') return route.continue();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ method: request.method(), path: url.pathname });
    const json = value => route.fulfill({ headers, json: value });
    if (url.pathname === '/auth/me') { if (holdAuth) await authGate; return json(user); }
    if (url.pathname === '/auth/signup-policy') return json({ enabled: true, trial_days: 3, password_min_length: 8, password_max_length: 128 });
    if (url.pathname === '/dashboard/stats') {
      if (holdDashboard) await authGate;
      if (dashboardFailure) return route.fulfill({ status: 503, headers, json: { detail: 'Fixture attendance unavailable' } });
      return json({ ...dashboard, attendance });
    }
    if (url.pathname === '/sessions/active') return json(session);
    if (url.pathname === '/sessions') return json([session]);
    if (url.pathname === '/classes') return json([classroom]);
    if (url.pathname === '/terms') return json([{ id: 1, name: 'First Term', session_id: 1 }]);
    if (url.pathname === '/exams') return json([]);
    if (url.pathname === '/superadmin/organizations') return json([org]);
    if (url.pathname === '/superadmin/stats') return json({ total: 1, trial: 1, active: 0, expired: 0, suspended: 0 });
    if (url.pathname === '/promotion/preview/1') return json({ classroom_id: 1, total_students: 1, passed_students: [{ student_id: 1, name: 'Fixture Student', admission_no: 'TEST' }], failed_students: [], no_result_students: [] });
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/hydration|did not match/i.test(message.text())) errors.push(message.text()); });
  t.after(() => { assert.deepEqual(errors, []); assert.ok(calls.every(call => call.method === 'GET'), 'Theme checks must never write school data'); });
  return { page, release, calls };
}

async function tokenStyle(locator, property, token) {
  await locator.waitFor();
  const { actual, expected } = await locator.evaluate((el, { property, token }) => {
    const sample = document.createElement('span');
    sample.style.setProperty(property, `var(${token})`);
    document.body.appendChild(sample);
    const expected = getComputedStyle(sample).getPropertyValue(property);
    sample.remove();
    return { actual: getComputedStyle(el).getPropertyValue(property), expected };
  }, { property, token });
  assert.equal(actual, expected, `${property} should use ${token}`);
}

async function capture(page, name) {
  if (!process.env.THEME_TEST_SCREENSHOT_DIR) return;
  await mkdir(process.env.THEME_TEST_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.THEME_TEST_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

for (const mode of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`${mode} ${width}px: dashboard, menu, focus and persistent theme switch`, async t => {
      const { page } = await fixture(t, { mode, width });
      await page.goto(frontend + '/dashboard');
      await page.getByText('Total Students', { exact: true }).waitFor();
      assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme), mode);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const menu = page.getByRole('button', { name: 'Open user menu' });
      await menu.focus();
      assert.notEqual(await menu.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await menu.press('Enter');
      const profile = page.getByRole('button', { name: 'My Profile', exact: true });
      await tokenStyle(profile, 'color', '--text-secondary');
      await tokenStyle(profile.locator('../..'), 'background-color', '--dialog');
      await profile.hover();
      await page.waitForTimeout(220);
      await tokenStyle(profile, 'background-color', '--surface-hover');
      await capture(page, `after-${mode}-${width}-menu`);
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      const next = mode === 'light' ? 'dark' : 'light';
      await page.getByRole('button', { name: `Switch to ${next} mode` }).click();
      await page.reload();
      await page.getByText('Total Students', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('theme-mode')), next);
      assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme), next);
    });

    test(`${mode} ${width}px: exam dialog, native date and disabled button`, async t => {
      const { page } = await fixture(t, { mode, width });
      await page.goto(frontend + '/exams');
      await page.getByRole('button', { name: 'Schedule Exam', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await tokenStyle(dialog, 'background-color', '--dialog');
      const date = dialog.locator('input[type=date]').first();
      await tokenStyle(date, 'background-color', '--input');
      assert.equal(await date.evaluate(el => getComputedStyle(el).colorScheme), mode);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, `after-${mode}-${width}-dialog`);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    });
  }

  test(`${mode}: MUI promotion menu, selected option, table hover and confirmation portal`, async t => {
    const { page } = await fixture(t, { mode });
    await page.goto(frontend + '/academics/promotion');
    const currentClass = page.getByRole('combobox', { name: 'Current Class' });
    await currentClass.click();
    const option = page.getByRole('option', { name: /Grade 5.*A/ });
    await option.click();
    await currentClass.click();
    assert.equal(await page.getByRole('option', { name: /Grade 5.*A/ }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Promote To Session' }).click();
    await page.getByRole('option', { name: session.name }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'Fixture Student' });
    await row.hover(); await page.waitForTimeout(300);
    await tokenStyle(row, 'background-color', '--surface-hover');
    await page.getByRole('button', { name: 'Promote', exact: true }).click();
    await tokenStyle(page.getByRole('dialog'), 'background-color', '--surface');
    await capture(page, `after-${mode}-promotion`);
    await page.keyboard.press('Escape');
  });

  test(`${mode}: superadmin MUI select portal and activation dialog`, async t => {
    const { page } = await fixture(t, { mode, superadmin: true, width: 390 });
    await page.goto(frontend + '/superadmin');
    await page.getByRole('combobox', { name: 'Status' }).click();
    const list = page.getByRole('listbox');
    await tokenStyle(list.locator('..'), 'background-color', '--dialog');
    await page.getByRole('option', { name: 'All Status' }).click();
    const table = page.getByRole('table');
    await table.getByRole('row').filter({ hasText: 'Fixture School' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: /Activate/ }).first().click();
    const dialog = page.getByRole('dialog');
    await tokenStyle(dialog, 'background-color', '--surface');
    await dialog.getByRole('combobox', { name: 'Select Plan' }).click();
    await tokenStyle(page.getByRole('listbox').locator('..'), 'background-color', '--dialog');
    await capture(page, `after-${mode}-superadmin`);
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const next = mode === 'light' ? 'dark' : 'light';
    await page.getByRole('button', { name: `Switch to ${next} mode` }).click();
    await page.getByRole('combobox', { name: 'Status' }).click();
    await tokenStyle(page.getByRole('listbox').locator('..'), 'background-color', '--dialog');
  });

  test(`${mode}: auth forms and validation errors use shared surfaces`, async t => {
    const { page } = await fixture(t, { mode, anonymous: true, width: 390 });
    for (const path of ['/signin', '/signup']) {
      await page.goto(frontend + path);
      const email = page.getByLabel('Email address', { exact: true });
      await tokenStyle(email, 'background-color', '--input');
      await tokenStyle(email, 'color', '--foreground');
      assert.equal(await email.evaluate(el => getComputedStyle(el).colorScheme), mode);
    }
    await page.getByLabel('School name', { exact: true }).fill('Fixture School');
    await page.getByLabel('Full name', { exact: true }).fill('Fixture Admin');
    await page.getByLabel('Email address', { exact: true }).fill('fixture@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('FixturePassword2026!');
    await page.getByLabel('Confirm password', { exact: true }).fill('NotMatching2026!');
    await page.getByRole('button', { name: 'Create School Account', exact: true }).click();
    const error = page.getByRole('alert').filter({ hasText: 'Passwords do not match' });
    await tokenStyle(error, 'color', '--danger');
    await capture(page, `after-${mode}-validation`);
  });

  test(`${mode}: charts have readable axes and themed tooltips`, async t => {
    const { page } = await fixture(t, { mode });
    await page.goto(frontend + '/dashboard');
    const chart = page.locator('.recharts-wrapper').filter({ has: page.locator('.recharts-xAxis') }).first();
    const tick = chart.locator('.recharts-cartesian-axis-tick-value').first();
    await tokenStyle(tick, 'fill', '--text-muted');
    await chart.locator('.recharts-bar-rectangle').first().hover();
    const tooltip = chart.locator('.recharts-tooltip-wrapper').filter({ hasText: 'students' });
    await tooltip.waitFor({ state: 'visible' });
    await tokenStyle(tooltip.locator(':scope > div'), 'background-color', '--dialog');
    await capture(page, `after-${mode}-chart`);
  });

  test(`${mode}: attendance replaces the old donut, shows saved counts and backend percentage without another request`, async t => {
    const { page, calls } = await fixture(t, { mode });
    await page.goto(frontend + '/dashboard');
    await page.getByRole('heading', { name: "Today's Attendance", exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Student Status', exact: true }).count(), 0);
    const counts = page.getByLabel("Today's attendance counts");
    for (const label of ['Present: 3', 'Absent: 1', 'Leave: 1', 'Not Marked: 2']) await counts.getByText(label, { exact: true }).waitFor();
    const card = page.getByRole('heading', { name: "Today's Attendance", exact: true }).locator('../../..');
    await card.getByText('42.86%', { exact: true }).waitFor();
    // Aim at the ring: the sector bounding-box center can be in the donut hole.
    const svg = card.locator('.recharts-surface');
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 73 / Math.sqrt(2), box.y + box.height / 2 - 73 / Math.sqrt(2));
    const tooltip = card.locator('.recharts-tooltip-wrapper');
    await tooltip.waitFor({ state: 'visible' });
    assert.doesNotMatch(await tooltip.innerText(), /Rs/);
    await page.getByRole('heading', { name: 'Students Per Class', exact: true }).waitFor();
    assert.equal(calls.filter(call => call.path === '/dashboard/stats').length, 1);
    assert.equal(calls.filter(call => call.path.startsWith('/attendance')).length, 0);
    await capture(page, `after-${mode}-attendance`);
  });
}

test('attendance handles empty, unmarked, non-school days and additional recorded statuses', async t => {
  for (const [attendance, expected] of [
    [{ ...dashboard.attendance, total: 0, present: 0, absent: 0, leave: 0, not_marked: 0, percentage: 0, marked: false }, 'No eligible students'],
    [{ ...dashboard.attendance, present: 0, absent: 0, leave: 0, not_marked: 7, percentage: 0, marked: false }, 'Attendance has not been marked today.'],
    [{ ...dashboard.attendance, is_school_day: false }, 'No school scheduled today. Any recorded attendance is shown below.'],
    [{ ...dashboard.attendance, late: 1, other: 1, not_marked: 0 }, 'Late: 1'],
  ]) {
    const { page } = await fixture(t, { attendance });
    await page.goto(frontend + '/dashboard');
    await page.getByText(expected, { exact: true }).waitFor();
    if (attendance.other) await page.getByText('Other: 1', { exact: true }).waitFor();
  }
});

test('attendance uses existing dashboard loading and error states', async t => {
  const loading = await fixture(t, { holdDashboard: true });
  await loading.page.goto(frontend + '/dashboard');
  await loading.page.getByRole('status', { name: 'Loading dashboard' }).waitFor();
  loading.release();
  await loading.page.getByRole('heading', { name: "Today's Attendance", exact: true }).waitFor();
  const failed = await fixture(t, { dashboardFailure: true });
  await failed.page.goto(frontend + '/dashboard');
  await failed.page.getByText('Fixture attendance unavailable', { exact: true }).waitFor();
  assert.equal(await failed.page.getByLabel("Today's attendance counts").count(), 0);
});

test('theme applies before delayed auth hydration, invalid/storage-blocked preferences remain usable', async t => {
  const { page, release } = await fixture(t, { mode: 'light', holdAuth: true });
  await page.goto(frontend + '/exams');
  await tokenStyle(page.locator('body'), 'background-color', '--background');
  assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme), 'light');
  release();
  await page.getByRole('heading', { name: 'Examinations', exact: true }).waitFor();
  for (const options of [{ mode: 'invalid' }, { mode: 'light', brokenStorage: true }]) {
    const fixturePage = (await fixture(t, options)).page;
    await fixturePage.goto(frontend + '/exams');
    await fixturePage.getByRole('button', { name: 'Switch to light mode' }).click();
    assert.equal(await fixturePage.locator('html').evaluate(el => getComputedStyle(el).colorScheme), 'light');
  }
});
