// All school API traffic is mocked; no registration reaches a real backend.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || 'playwright');
const frontend = process.env.EXAM_TEST_FRONTEND || 'http://127.0.0.1:3107';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(frontend).hostname));
const password = 'FixturePassword2026!';
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, { width = 1440, enabled = true, policyFails = false, failure = null, pending = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.after(async () => { release(); await context.close(); });
  await context.addInitScript(() => localStorage.setItem('theme-mode', 'dark'));
  const posts = [], calls = [];
  let policyAttempts = 0;
  const headers = { 'access-control-allow-origin': frontend, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === frontend && request.method() === 'GET') return route.continue();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push(url.pathname);
    if (url.pathname === '/auth/signup-policy') {
      policyAttempts++;
      if (policyFails && policyAttempts === 1) return route.fulfill({ status: 503, headers, json: { detail: 'Fixture policy failure' } });
      return route.fulfill({ headers, json: { enabled, trial_days: 3, password_min_length: 8, password_max_length: 128 } });
    }
    if (url.pathname === '/auth/signup') {
      assert.equal(request.method(), 'POST');
      posts.push(request.postDataJSON());
      if (pending) await gate;
      return route.fulfill({ status: failure ? 400 : 200, headers, json: failure ? { detail: failure } : { message: 'Organization created', user_id: 9, organization_id: 8, role: 'admin' } });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(frontend + '/signup');
  await page.getByRole('heading', { name: 'Create your school account', exact: true }).waitFor();
  return { page, posts, calls, release };
}

async function fill(page) {
  await page.getByLabel('School name', { exact: true }).fill(' Fixture School ');
  await page.getByLabel('Full name', { exact: true }).fill(' Fixture Administrator ');
  await page.getByLabel('Email address', { exact: true }).fill('fixture@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
}

test('signup succeeds once, sends only registration fields, and continues through Sign In', async t => {
  const { page, posts, calls } = await fixture(t);
  await fill(page);
  await page.getByRole('button', { name: 'Create School Account', exact: true }).click();
  await page.getByRole('heading', { name: 'Your school account is ready', exact: true }).waitFor();
  assert.deepEqual(posts, [{ organization_name: 'Fixture School', full_name: 'Fixture Administrator', email: 'fixture@example.com', password, confirm_password: password }]);
  assert.equal(new URL(page.url()).pathname, '/signup');
  assert.equal(await page.getByLabel('Password', { exact: true }).count(), 0);
  assert.ok(!calls.includes('/auth/login'));
  assert.ok(!calls.includes('/dashboard/stats'));
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes(password));
  await page.getByRole('link', { name: 'Continue to Sign In', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in to your account', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Create School Account', exact: true }).getAttribute('href'), '/signup');
});

test('password mismatch and invalid email never submit, and password controls are accessible', async t => {
  const { page, posts } = await fixture(t);
  await fill(page);
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Create School Account', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Passwords do not match' }).waitFor();
  assert.equal(posts.length, 0);
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.getByRole('button', { name: 'Show confirm password', exact: true }).click();
  assert.equal(await page.getByLabel('Confirm password', { exact: true }).getAttribute('type'), 'text');
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel('Email address', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Create School Account', exact: true }).click();
  assert.equal(posts.length, 0);
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('minlength'), '8');
});

test('duplicate email errors preserve form values and stop the loading state', async t => {
  const { page, posts, release } = await fixture(t, { failure: 'Email already registered', pending: true });
  await fill(page);
  await page.getByRole('button', { name: 'Create School Account', exact: true }).click();
  const loading = page.getByRole('button', { name: 'Creating account…', exact: true });
  await loading.waitFor();
  assert.equal(await loading.isDisabled(), true);
  assert.equal(await page.getByLabel('School name', { exact: true }).isDisabled(), true);
  assert.equal(posts.length, 1);
  release();
  await page.getByRole('alert').filter({ hasText: 'Email already registered' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Create School Account', exact: true }).isEnabled(), true);
  assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), password);
});

test('backend validation errors render clearly and retain the entered administrator details', async t => {
  const { page } = await fixture(t, { failure: [{ type: 'value_error', msg: 'Value error, Email already registered' }] });
  await fill(page);
  await page.getByRole('button', { name: 'Create School Account', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Email already registered' }).waitFor();
  assert.equal(await page.getByLabel('Email address', { exact: true }).inputValue(), 'fixture@example.com');
  assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), password);
  assert.equal(await page.getByRole('button', { name: 'Create School Account', exact: true }).isEnabled(), true);
});

test('disabled registration cannot submit and policy failures can be retried', async t => {
  const disabled = await fixture(t, { enabled: false });
  await disabled.page.getByRole('alert').filter({ hasText: 'Public school registration is currently unavailable' }).waitFor();
  await fill(disabled.page);
  assert.equal(await disabled.page.getByRole('button', { name: 'Create School Account', exact: true }).isDisabled(), true);
  assert.equal(disabled.posts.length, 0);
  const retry = await fixture(t, { policyFails: true });
  await retry.page.getByRole('alert').filter({ hasText: 'could not be checked' }).waitFor();
  await retry.page.getByRole('button', { name: 'Retry', exact: true }).click();
  await fill(retry.page);
  await retry.page.getByRole('button', { name: 'Create School Account', exact: true }).click();
  await retry.page.getByRole('heading', { name: 'Your school account is ready', exact: true }).waitFor();
});

test('signup shares the sign-in design, fits all widths, and preserves the dashboard theme', async t => {
  for (const width of [1440, 768, 390, 320]) {
    const { page, calls } = await fixture(t, { width });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px must not overflow`);
    assert.equal(await page.locator('main').evaluate(element => getComputedStyle(element).colorScheme), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('theme-mode')), 'dark');
    const home = page.getByRole('link', { name: 'Schoolix home' });
    assert.equal(await home.innerText(), 'Schoolix');
    assert.equal(await home.locator('img[alt=""][src*="%2Flogo.png"]').count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Sign In', exact: true }).getAttribute('href'), '/signin');
    assert.deepEqual(calls, ['/auth/signup-policy']);
    if (process.env.SIGNUP_TEST_SCREENSHOT_DIR && [1440, 390].includes(width)) {
      await mkdir(process.env.SIGNUP_TEST_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.SIGNUP_TEST_SCREENSHOT_DIR, `signup-${width}.png`), fullPage: true });
    }
  }
});
