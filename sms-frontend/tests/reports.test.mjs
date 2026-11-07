// Browser checks use synthetic responses and block every unrecognized API call.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
const { chromium } = createRequire(import.meta.url)(process.env.EXAM_TEST_PLAYWRIGHT || 'playwright');
const frontend = process.env.EXAM_TEST_FRONTEND || 'http://127.0.0.1:3107';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(frontend).hostname));
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.EXAM_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });
const identity = { student_id: 1, student_name: 'Report Fixture', admission_no: 'TEST', grade_name: 'Grade 5', section: 'A' };
const student = { ...identity, id: 1, first_name: 'Report', last_name: 'Fixture', gender: 'male', is_active: true, roll_number: '1' };
const exam = { ...identity, enrollment_id: 1, exam_id: 1, exam_name: 'Fixture Exam', subject_name: 'English', obtained_marks: null,
  total_marks: 100, pass_marks: 40, grade: null, gpa: null, overall_result: 'INCOMPLETE', overall_percentage: null, missing_count: 1, failed_count: 0 };
const payloads = {
  students: [student], 'exam-results': [exam],
  'exam-summary': { exam_id: 1, exam_name: 'Fixture Exam', session_id: 1, session_name: '2026-27', columns: [{ key: '1:100', subject_name: 'English', total_marks: 100 }],
    items: [{ ...exam, roll_number: '1', classroom_id: 1, subjects: [{ key: '1:100', paper_id: 1, subject_name: 'English', total_marks: 100, obtained_marks: null }],
      obtained_total: 0, possible_total: 100, percentage: null, result: 'INCOMPLETE' }] },
  attendance: [{ ...identity, total_days: 0, present: 0, absent: 0, leave: 0, late: 0, other: 0, attendance_pct: null }],
  fees: { items: [{ ...identity, id: 1, month: 'April', total_amount: 1000, discount_amount: 100, final_amount: 900, paid_amount: 900, status: 'paid' }],
    total_billed: 900, total_paid: 900, total_pending: 0, session_cash_received: 1400, session_advance_credit: 500 },
  payroll: [{ id: 1, member_name: 'Staff Fixture', role: 'teacher', basic_salary: 1000, allowances: 50, deductions: 100, net_salary: 950, month: '2026-04', status: 'paid', paid_amount: 950 }],
};

async function fixture(t, handler) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const user = { id: 91, org_id: 7, org_role: 'admin', full_name: 'Fixture Admin' };
  await context.addInitScript(user => {
    localStorage.setItem('theme-mode', 'light');
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token: 'fixture', refreshToken: 'fixture', expiresAt: Date.now()+3600000 }, version: 0 }));
    window.print = () => { window.testPrinted = true; };
  }, user);
  const calls = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === frontend && route.request().method() === 'GET') return route.continue();
    const headers = { 'access-control-allow-origin': frontend, 'access-control-allow-headers': 'authorization,content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push(url);
    const send = data => route.fulfill({ json: data, headers });
    if (handler && await handler(url, route, send)) return;
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/auth/me') return send(user);
    if (path === '/sessions') return send([{ id: 1, name: '2026-27' }, { id: 3, name: '2025-26' }]);
    if (path === '/sessions/active') return send({ id: 1, name: '2026-27' });
    if (path === '/grades') return send([{ id: 1, name: 'Grade 5' }]);
    if (path === '/classes') return send([{ id: 1, grade_name: 'Grade 5', section: 'A' }]);
    if (path === '/reports/options') return send({ exams: [{ id: 1, name: 'Fixture Exam' }] });
    if (path === '/organization/profile') return send({ name: 'Fixture School', logo: null });
    if (path.startsWith('/reports/')) return send(payloads[path.split('/').pop()] ?? []);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  return { page, context, calls };
}

for (const [route, title, text] of [
  ['students', 'Student Report', 'Report Fixture'], ['exams', 'Exam Report', 'INCOMPLETE'],
  ['attendance', 'Attendance Report', 'Not recorded'], ['fees', 'Fee Report', 'Session Advance Credit'], ['payroll', 'Payroll Report', 'Staff Fixture'],
]) test(`${title} renders and refetches the selected academic session`, async t => {
  const { page, calls } = await fixture(t);
  await page.goto(`${frontend}/reports/${route}`);
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.getByText(text, { exact: route !== 'exams' }).filter({ visible: true }).first().waitFor();
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/reports/') && response.url().includes('session_id=3')),
    page.getByLabel('Academic session', { exact: true }).selectOption('3'),
  ]);
  assert.ok(calls.some(url => url.pathname.startsWith('/reports/') && url.searchParams.get('session_id') === '3'));
  assert.ok(!calls.some(url => url.searchParams.get('limit') === '500'));
});

test('an old filter response cannot overwrite the latest report', async t => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const { page } = await fixture(t, async (url, route, send) => {
    if (url.pathname === '/reports/students') {
      if (url.searchParams.get('session_id') === '1') { await blocked; await send([{ ...student, first_name: 'Old', student_name: 'Old Fixture' }]); }
      else await send([{ ...student, first_name: 'Latest', student_name: 'Latest Fixture' }]);
      return true;
    }
    return false;
  });
  await page.goto(frontend + '/reports/students');
  await page.getByLabel('Academic session', { exact: true }).selectOption('3');
  await page.getByText('Latest Fixture', { exact: true }).filter({ visible: true }).first().waitFor();
  const oldResponse = page.waitForResponse(response => response.url().includes('/reports/students?session_id=1'));
  release();
  await oldResponse;
  assert.equal(await page.getByText('Old Fixture', { exact: true }).count(), 0);
});

test('print export escapes student text and includes school and selected session', async t => {
  const unsafe = '<script>window.exportInjected=true</script>';
  const { page } = await fixture(t, async (url, route, send) => {
    if (url.pathname === '/reports/students') { await send([{ ...student, first_name: unsafe }]); return true; }
    return false;
  });
  await page.goto(frontend + '/reports/students');
  await page.getByText(unsafe + ' Fixture', { exact: true }).filter({ visible: true }).first().waitFor();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const printed = await popup;
  await printed.getByRole('heading', { name: 'Fixture School', exact: true }).waitFor();
  assert.ok((await printed.locator('body').innerText()).includes('2026-27'));
  assert.equal(await printed.locator('script').count(), 0);
  assert.equal(await printed.evaluate(() => window.exportInjected), undefined);
  await printed.close();
});

test('report failures show an error, stop loading and recover on Refresh', async t => {
  let failed = true;
  const { page } = await fixture(t, async (url, route, send) => {
    if (url.pathname !== '/reports/students') return false;
    if (failed) await route.fulfill({ status: 500, headers: { 'access-control-allow-origin': frontend }, json: { detail: 'Fixture failure' } });
    else await send([student]);
    return true;
  });
  await page.goto(frontend + '/reports/students');
  await page.getByRole('alert').filter({ hasText: 'Could not load this report' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export PDF' }).isDisabled(), true);
  failed = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Report Fixture', { exact: true }).filter({ visible: true }).waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: 'Could not load this report' }).count(), 0);
});

test('session failures show an error instead of an endless report spinner', async t => {
  const { page } = await fixture(t, async (url, route) => {
    if (url.pathname !== '/sessions') return false;
    await route.fulfill({ status: 500, headers: { 'access-control-allow-origin': frontend }, json: { detail: 'Fixture failure' } });
    return true;
  });
  await page.goto(frontend + '/reports/exams');
  await page.getByRole('alert').filter({ hasText: 'Academic sessions are unavailable' }).waitFor();
  assert.equal(await page.getByText('Loading report', { exact: true }).count(), 0);
});

test('large report tables paginate while exports retain every filtered row', async t => {
  const data = Array.from({ length: 51 }, (_, i) => ({ ...student, id: i+1, first_name: `Student ${i+1}`, admission_no: `FIX-${i+1}` }));
  const { page } = await fixture(t, async (url, route, send) => {
    if (url.pathname === '/reports/students') { await send(data); return true; }
    return false;
  });
  await page.goto(frontend + '/reports/students');
  await page.getByRole('navigation', { name: 'Report pagination' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 50);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('tbody tr').count(), 1);
  const pending = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const popup = await pending;
  await popup.getByRole('heading', { name: 'Fixture School', exact: true }).waitFor();
  assert.equal(await popup.locator('tbody tr').count(), 51);
  await popup.close();
});

test('exam report has one student row and exports Excel, CSV and PDF with the selected filters', async t => {
  const exports = [];
  const { page } = await fixture(t, async (url, route) => {
    if (url.pathname !== '/reports/exam-summary/export') return false;
    exports.push(Object.fromEntries(url.searchParams));
    await route.fulfill({ headers: { 'access-control-allow-origin': frontend, 'content-type': 'application/octet-stream' }, body: 'Fixture saved export' });
    return true;
  });
  await page.goto(frontend + '/reports/exams');
  await page.getByText('INCOMPLETE', { exact: false }).filter({ visible: true }).first().waitFor();
  await page.locator('tbody tr').first().waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByRole('columnheader', { name: 'English (100)', exact: true }).waitFor();
  await page.getByLabel('Result', { exact: true }).selectOption('incomplete');
  await page.getByRole('button', { name: 'Export Results' }).waitFor();
  for (const format of ['xlsx', 'csv', 'pdf']) {
    await page.getByLabel('Report export format').selectOption(format);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Results' }).click();
    assert.equal((await download).suggestedFilename(), `Exam_1_Results.${format}`);
  }
  assert.deepEqual(exports.map(row => row.format), ['xlsx', 'csv', 'pdf']);
  for (const row of exports) assert.deepEqual({ ...row, format: undefined }, { session_id: '1', exam_id: '1', result: 'incomplete', format: undefined });
});
