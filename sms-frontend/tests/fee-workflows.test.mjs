// Run against Next on 127.0.0.1:45898 with NEXT_PUBLIC_API_URL=http://127.0.0.1:45899.
// The second address is intercepted by Playwright. No test reaches a real backend.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FEE_TEST_PLAYWRIGHT || "playwright");
const frontend = "http://127.0.0.1:45898";
const mockApi = "http://127.0.0.1:45899";
const user = { id: 15, org_id: 23, org_role: "admin", full_name: "Test Admin", email: "fixture@example.invalid" };
const session = { id: 42, name: "2026–27", start_date: "2026-04-01", end_date: "2027-03-31", is_active: true };
const student = {
  id: 7, first_name: "Fixture", last_name: "Student", admission_no: "TEST-7", is_active: true,
  current_enrollment: { class_name: "Grade 4 – A", is_active: true }, active_session: session,
};
const periods = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
const headers = {
  "access-control-allow-origin": frontend, "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, idempotency-key",
};
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.FEE_TEST_CHROMIUM }); });
after(async () => { await browser?.close(); });

async function fixture(t, { theme = "light", width = 1200, responses = [], historyError = false, ledgerRow = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  t.after(() => context.close());
  await context.addInitScript(({ user, theme }) => {
    localStorage.setItem("auth-storage", JSON.stringify({
      state: { user, token: "fixture-token", expiresAt: Date.now() + 3_600_000 }, version: 0,
    }));
    localStorage.setItem("theme-mode", theme);
  }, { user, theme });

  const calls = [];
  let collected = false;
  let finalized = false;
  let confirms = 0;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === frontend) return route.continue();
    if (url.origin !== mockApi) return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const call = { path: url.pathname, method: request.method(), headers: request.headers() };
    if (request.postData()) call.body = request.postDataJSON();
    calls.push(call);
    const json = (data, status = 200) => route.fulfill({ json: data, status, headers });
    switch (url.pathname) {
      case "/auth/me": return json(user);
      case "/students/7/details": return json(student);
      case "/sessions": return json([session]);
      case "/sessions/active": return json(session);
      case "/classes": return json([{ id: 5, section: "A", grade_name: "Grade 4" }]);
      case "/fees/ledger": return json({ items: [{
        id: 3, student_name: "Fixture Student", month: "October", admission_fee: 0, monthly_fee: 700,
        exam_fee: 0, total_amount: 700, discount_percent: 0, discount_amount: 0, final_amount: 700,
        paid_amount: 0, due_amount: 700, status: "unpaid", ...ledgerRow,
      }], total_pages: 1 });
      case "/fee-structure": return json([{
        id: 9, class_id: 5, session_id: 42, class_name: "Grade 4 – A",
        monthly_fee: 700, admission_fee: 0, exam_fee: 0, rates_finalized: finalized,
      }]);
      case "/fee-structure/9":
        finalized = call.body.rates_finalized;
        return json({ id: 9, ...call.body });
      case "/fees/students/7/history": return historyError ? json({ detail: "Unable to load student fee history." }, 503) : json({
        sessions: [{ session_id: 42, session_name: session.name, billed: collected ? "4200.00" : "0.00",
          paid: collected ? "2000.00" : "0.00", outstanding: collected ? "2200.00" : "0.00", available_credit: "0.00" }],
        items: collected ? [{ fee_id: 81, billing_period: "2026-10", final_amount: "700.00",
          paid_amount: "700.00", outstanding: "0.00", future: true, overdue: false, status: "paid" }] : [],
      });
      case "/fees/students/7/payments": return json({ items: collected ? [{
        transaction_id: 31, receipt_no: "TEST-31", payment_date: "2026-10-03",
        amount: "2000.00", available_credit: "0.00", allocations: [],
      }] : [] });
      case "/fees/collection/preview": return json({
        preview_id: "f".repeat(64), student_name: "Fixture Student", session_name: session.name,
        obligations: [], previous_dues: [], available_credit: "0.00", total_payable: "4200.00",
        cash_received: call.body.amount, credit_used: "0.00", remaining_due: "2200.00",
        new_advance_credit: "0.00", remaining_advance_credit: "0.00",
      });
      case "/fees/collection/multi": {
        const action = responses[confirms++];
        if (action === "offline") return route.abort("failed");
        if (action === "stale") return json({ detail: "Preview is stale; request a fresh preview before confirming" }, 409);
        if (action === "conflict") return json({ detail: "Collection conflicted; retry with the same Idempotency-Key" }, 409);
        if (action === "auth") return json({ detail: "Not authenticated" }, 401);
        collected = true;
        return json({ transaction_id: action === "credit" ? null : 31 });
      }
      case "/fees/payments/31/receipt": return route.fulfill({
        status: 200, headers, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF",
      });
      default: return json({ detail: "Unexpected fixture request" }, 404);
    }
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (/unique "key"|same key/i.test(message.text())) problems.push(message.text());
  });
  t.after(() => assert.deepEqual(problems, []));
  return { page, calls };
}

async function profile(page) {
  await page.goto(frontend + "/students/7");
  await page.getByRole("tab", { name: "Fees" }).click();
}

async function reviewHalfYear(page) {
  await page.getByRole("button", { name: "Collect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Collect fee payment" });
  await dialog.getByLabel("Collection period").selectOption("half_yearly");
  await dialog.getByLabel("Starting month").fill("2026-10");
  await dialog.getByLabel("Amount received (PKR)").fill("2000");
  await dialog.getByRole("button", { name: "Preview payment" }).click();
  await dialog.getByRole("button", { name: "Confirm payment" }).waitFor();
  return dialog;
}

test("profile confirmation submits the reviewed request, refreshes history and authenticates reprinting", async (t) => {
  const { page, calls } = await fixture(t, { width: 390, theme: "dark", responses: ["offline", "auth", "conflict"] });
  await profile(page);
  await page.getByText("No fee obligations for this selection.").waitFor();
  assert.equal(await page.locator("html").evaluate((element) => element.classList.contains("dark")), true);
  const dialog = await reviewHalfYear(page);
  const preview = calls.find((call) => call.path === "/fees/collection/preview");
  assert.deepEqual(preview.body.billing_periods, periods);
  assert.equal(preview.body.student_id, 7);
  assert.equal(preview.body.session_id, 42);
  assert.equal(await dialog.evaluate((element) => element.getBoundingClientRect().width <= window.innerWidth), true);
  await dialog.getByRole("button", { name: "Confirm payment" }).click();
  for (let index = 0; index < 3; index++) {
    await dialog.getByRole("button", { name: "Retry confirmation" }).click();
  }
  const success = page.getByRole("dialog", { name: "Payment successful" });
  await success.waitFor();
  const confirmations = calls.filter((call) => call.path === "/fees/collection/multi");
  assert.equal(confirmations.length, 4);
  assert.ok(confirmations[0].headers["idempotency-key"]);
  for (const attempt of confirmations) {
    assert.equal(attempt.headers["idempotency-key"], confirmations[0].headers["idempotency-key"]);
    assert.deepEqual(attempt.body, { ...preview.body, preview_id: "f".repeat(64) });
  }
  await success.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByText("TEST-31", { exact: false }).waitFor();
  await page.getByText("Paid", { exact: true }).last().waitFor();
  assert.equal(calls.filter((call) => call.path.endsWith("/receipt")).length, 0);
  const receipt = page.waitForRequest((request) => request.url() === mockApi + "/fees/payments/31/receipt" && request.method() === "GET");
  await page.getByRole("button", { name: "Print receipt" }).click();
  assert.equal((await receipt).headers().authorization, "Bearer fixture-token");
  assert.equal(calls.filter((call) => call.path === "/fees/collection/multi").length, 4);
});

test("stale preview needs another review and malformed custom months are rejected", async (t) => {
  const { page, calls } = await fixture(t, { responses: ["stale"] });
  await profile(page);
  const dialog = await reviewHalfYear(page);
  await dialog.getByRole("button", { name: "Confirm payment" }).click();
  const previewButton = dialog.getByRole("button", { name: "Preview payment" });
  await previewButton.waitFor();
  await dialog.getByLabel("Collection period").selectOption("custom");
  await dialog.getByLabel("Months (YYYY-MM, comma-separated)").fill("2026-10, 2026-13");
  await previewButton.click();
  await page.getByText(/Select a session, valid unique months/).waitFor();
  assert.equal(calls.filter((call) => call.path === "/fees/collection/preview").length, 1);
  await dialog.getByLabel("Months (YYYY-MM, comma-separated)").fill("2027-01, 2026-10");
  await previewButton.click();
  await dialog.getByRole("button", { name: "Confirm payment" }).click();
  await page.getByRole("dialog", { name: "Payment successful" }).waitFor();
  const attempts = calls.filter((call) => call.path === "/fees/collection/multi");
  assert.deepEqual(attempts[1].body.billing_periods, ["2026-10", "2027-01"]);
  assert.notEqual(attempts[0].headers["idempotency-key"], attempts[1].headers["idempotency-key"]);
});

test("fee structure shows and saves explicit confirmation and ledger keeps the legacy collection", async (t) => {
  const { page, calls } = await fixture(t);
  await page.goto(frontend + "/finance/fee-structure");
  await page.getByText("Provisional", { exact: true }).waitFor();
  await page.getByTitle("Edit fee structure").filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Fee Structure" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await page.getByText("Finalized", { exact: true }).waitFor();
  assert.equal(calls.find((call) => call.method === "PUT").body.rates_finalized, true);
  await page.goto(frontend + "/finance/fee-management");
  await page.getByLabel("Class", { exact: true }).selectOption("5");
  await page.getByLabel("Month", { exact: true }).selectOption("October");
  await page.getByRole("button", { name: "Collect", exact: true }).click();
  await page.getByRole("dialog", { name: "Collect Payment", exact: true }).waitFor();
});

test("yearly quote is reviewable before payment and credit-only confirmation has no receipt action", async (t) => {
  const { page, calls } = await fixture(t, { responses: ["credit"] });
  await profile(page);
  await page.getByRole("button", { name: "Collect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Collect fee payment" });
  const discount = dialog.getByLabel("Optional yearly discount (%)");
  assert.equal(await discount.count(), 0);
  await dialog.getByLabel("Collection period").selectOption("yearly");
  await dialog.getByLabel("Starting month").fill("2026-04");
  await discount.fill("10");
  const previewButton = dialog.getByRole("button", { name: "Preview payment" });
  await previewButton.click();
  await dialog.getByText(/Enter the quoted settlement amount/).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Confirm payment" }).count(), 0);
  assert.equal(calls.find((call) => call.path.endsWith("/preview")).body.yearly_discount_percent, "10.00");
  await dialog.getByLabel("Existing credit to use (PKR)").fill("4200");
  await previewButton.click();
  await dialog.getByRole("button", { name: "Confirm payment" }).click();
  const success = page.getByRole("dialog", { name: "Advance credit applied" });
  await success.waitFor();
  assert.equal(await success.getByRole("button", { name: "Print receipt" }).count(), 0);
});

test("failed history fetch presents a retry rather than an empty ledger", async (t) => {
  const { page } = await fixture(t, { historyError: true });
  await profile(page);
  await page.getByRole("alert").getByText("Unable to load student fee history.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Try again" }).isVisible(), true);
  assert.equal(await page.getByText("No fee obligations for this selection.").isVisible(), false);
});

test("class ledger renders a yearly-settled row and its exact balances on desktop and mobile", async (t) => {
  const { page } = await fixture(t, { ledgerRow: {
    exam_fee: 20, total_amount: 720, discount_percent: 12.5, discount_amount: 87.5,
    yearly_discount_amount: 61.25, final_amount: 571.25, paid_amount: 571.25, due_amount: 0, status: "paid",
  } });
  await page.goto(frontend + "/finance/fee-management");
  await page.getByLabel("Class", { exact: true }).selectOption("5");
  await page.getByLabel("Month", { exact: true }).selectOption("October");
  const row = page.getByRole("row", { name: /Fixture Student/ });
  await row.getByText("Enrollment 12.5% · PKR 87.50").waitFor();
  await row.getByText("Yearly · PKR 61.25").waitFor();
  assert.equal(await row.getByRole("cell", { name: "PKR 571.25", exact: true }).isVisible(), true);
  assert.equal(await row.getByRole("cell").nth(8).textContent(), "PKR 0.00");
  assert.equal(await row.getByText("Paid", { exact: true }).isVisible(), true);
  assert.equal(await row.getByRole("button", { name: "Collect", exact: true }).count(), 0);

  await page.setViewportSize({ width: 390, height: 800 });
  const card = page.getByRole("article").filter({ hasText: "Fixture Student" });
  await card.getByText("Yearly · PKR 61.25").waitFor();
  assert.equal(await card.getByText("PKR 0.00", { exact: true }).isVisible(), true);
  assert.equal(await card.getByRole("button", { name: "Voucher for Fixture Student" }).isDisabled(), true);
  assert.equal(await card.getByRole("button", { name: "Collect payment" }).count(), 0);
});
