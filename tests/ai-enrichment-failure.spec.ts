/**
 * tests/ai-enrichment-failure.spec.ts
 *
 * Playwright tests for the Gemini AI enrichment fail-closed path in the
 * Clinical Reasoning Capture UI.
 *
 * Scenario: Gemini returns a 429 / billing-quota-depleted response.
 *
 * Behavioural guarantees verified:
 *  1. A visible alert surfaces mentioning "Gemini billing quota depleted".
 *  2. Required clinical reasoning fields remain empty (no AI pre-fill occurred).
 *  3. The Save button stays disabled until the operator fills all required fields.
 *  4. A Retry button is visible and triggers a fresh enrichment request.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = path.resolve(__dirname, '../engine/clinical-reasoning-capture.html');
const PAGE_URL  = `file://${PAGE_PATH}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Inject a fetch mock that returns a 429 quota error for any enrichment call.
 * Uses addInitScript so the mock is in place before the page script executes.
 * Stores a call-counter at window.__enrichCallCount for assertion in tests.
 */
async function injectQuotaErrorMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __enrichCallCount: number }).__enrichCallCount = 0;
    const _realFetch = window.fetch.bind(window);

    function resolveUrl(input: RequestInfo | URL): string {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      return (input as Request).url;
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);
      if (url.includes('gemini-enrich')) {
        (window as unknown as { __enrichCallCount: number }).__enrichCallCount++;
        return new Response(
          JSON.stringify({ error: 'Gemini billing quota depleted' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return _realFetch(input, init);
    };
  });
}

/** Navigate to the CRC page (mock must be injected before this call). */
async function loadPage(page: Page): Promise<void> {
  await page.goto(PAGE_URL);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Gemini enrichment — billing quota depleted (fail-closed)', () => {

  test('shows a visible alert mentioning Gemini billing quota depletion', async ({ page }) => {
    await injectQuotaErrorMock(page);
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    // The banner has role="alert"; assert its visibility and partial text.
    // Using a regex so copy wording changes don't break this test.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Gemini billing quota depleted/i);
  });

  test('required fields remain empty after quota error — no AI pre-fill', async ({ page }) => {
    await injectQuotaErrorMock(page);
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();
    // Wait for the alert to appear (enrichment has completed)
    await expect(page.getByRole('alert')).toBeVisible();

    // All three required fields must be empty — AI must not have pre-filled them.
    await expect(page.getByLabel(/chief complaint/i)).toBeEmpty();
    await expect(page.getByLabel(/assessment/i)).toBeEmpty();
    await expect(page.getByLabel(/plan/i)).toBeEmpty();
  });

  test('Save button is disabled when required fields are empty', async ({ page }) => {
    await injectQuotaErrorMock(page);
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await expect(page.getByRole('button', { name: /save to case log/i })).toBeDisabled();
  });

  test('Save button enables once operator fills all required fields manually', async ({ page }) => {
    await injectQuotaErrorMock(page);
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel(/chief complaint/i).fill('Chest pain radiating to left arm');
    await page.getByLabel(/assessment/i).fill('R/O ACS — STEMI vs NSTEMI');
    await page.getByLabel(/plan/i).fill('12-lead ECG, troponin, aspirin 300 mg, cardiology consult');

    await expect(page.getByRole('button', { name: /save to case log/i })).toBeEnabled();
  });

  test('Retry button is visible and triggers a second enrichment request', async ({ page }) => {
    await injectQuotaErrorMock(page);
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    const callCount1 = await page.evaluate(
      () => (window as unknown as { __enrichCallCount: number }).__enrichCallCount,
    );
    expect(callCount1).toBe(1);

    // Retry button must be visible
    const retryBtn = page.getByRole('button', { name: /retry/i });
    await expect(retryBtn).toBeVisible();

    // Clicking Retry must dispatch another fetch
    await retryBtn.click();
    await expect(page.getByRole('alert')).toBeVisible();

    const callCount2 = await page.evaluate(
      () => (window as unknown as { __enrichCallCount: number }).__enrichCallCount,
    );
    expect(callCount2).toBe(2);
  });

});
