import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = path.resolve(__dirname, '../engine/clinical-reasoning-capture.html');
const PAGE_URL = `file://${PAGE_PATH}`;
const SAFE_UNAVAILABLE = /AI output unavailable — review source\./i;

type Scenario = 'valid' | 'malformed-json' | 'truncated' | 'timeout' | 'rate-limit' | 'schema-mismatch';

async function injectScenarioMock(page: Page, scenario: Scenario): Promise<void> {
  await page.addInitScript((mockScenario: Scenario) => {
    (window as unknown as { __enrichCallCount: number }).__enrichCallCount = 0;
    const realFetch = window.fetch.bind(window);

    function resolveUrl(input: RequestInfo | URL): string {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      return (input as Request).url;
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveUrl(input);

      if (url.includes('enrichment-audit')) {
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('gemini-enrich')) {
        (window as unknown as { __enrichCallCount: number }).__enrichCallCount += 1;

        if (mockScenario === 'valid') {
          return new Response(
            JSON.stringify({
              suggestion: 'Consider serial troponin and repeat ECG in 30 minutes.',
              confidence: 0.95,
              tokenUsage: { promptTokens: 120, completionTokens: 42, totalTokens: 162 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (mockScenario === 'malformed-json') {
          return new Response('totally-not-json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (mockScenario === 'truncated') {
          return new Response('{"suggestion":"incomplete"', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (mockScenario === 'timeout') {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        if (mockScenario === 'schema-mismatch') {
          return new Response(
            JSON.stringify({
              suggestion: 123,
              confidence: 'high',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({ error: 'Gemini billing quota depleted' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return realFetch(input, init);
    };
  }, scenario);
}

async function loadPage(page: Page): Promise<void> {
  await page.goto(PAGE_URL);
}

test.describe('Gemini enrichment hardening fail-closed behavior', () => {
  test('valid response populates suggestions when schema and confidence pass', async ({ page }) => {
    await injectScenarioMock(page, 'valid');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    await expect(page.getByRole('alert')).toContainText(/ai enrichment applied/i);
    await expect(page.getByLabel(/ai suggestions/i)).toHaveValue(/serial troponin/i);
  });

  test('malformed JSON is rejected without crashing and remains fail-closed', async ({ page }) => {
    await injectScenarioMock(page, 'malformed-json');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    await expect(page.getByRole('alert')).toContainText(SAFE_UNAVAILABLE);
    await expect(page.getByLabel(/ai suggestions/i)).toBeEmpty();
    await expect(page.getByRole('button', { name: /save to case log/i })).toBeDisabled();
  });

  test('truncated stream is marked partial and exposes retry action', async ({ page }) => {
    await injectScenarioMock(page, 'truncated');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    await expect(page.getByRole('alert')).toContainText(SAFE_UNAVAILABLE);
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('timeout is treated as transient and surfaces retry guidance', async ({ page }) => {
    await injectScenarioMock(page, 'timeout');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    await expect(page.getByRole('alert')).toContainText(/timed out/i);
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('rate limit remains visible and fail-closed', async ({ page }) => {
    await injectScenarioMock(page, 'rate-limit');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    await expect(page.getByRole('alert')).toContainText(/Gemini billing quota depleted/i);
    await expect(page.getByLabel(/chief complaint/i)).toBeEmpty();
    await expect(page.getByLabel(/assessment/i)).toBeEmpty();
    await expect(page.getByLabel(/plan/i)).toBeEmpty();
  });

  test('schema mismatch is rejected and shown as unavailable', async ({ page }) => {
    await injectScenarioMock(page, 'schema-mismatch');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();

    await expect(page.getByRole('alert')).toContainText(SAFE_UNAVAILABLE);
    await expect(page.getByLabel(/ai suggestions/i)).toBeEmpty();
  });

  test('retry on partial/truncated response triggers another request', async ({ page }) => {
    await injectScenarioMock(page, 'truncated');
    await loadPage(page);

    await page.getByRole('button', { name: /enrich with ai/i }).click();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();

    const firstCount = await page.evaluate(
      () => (window as unknown as { __enrichCallCount: number }).__enrichCallCount,
    );
    expect(firstCount).toBe(1);

    await page.getByRole('button', { name: /retry/i }).click();
    await expect(page.getByRole('alert')).toContainText(SAFE_UNAVAILABLE);

    const secondCount = await page.evaluate(
      () => (window as unknown as { __enrichCallCount: number }).__enrichCallCount,
    );
    expect(secondCount).toBe(2);
  });
});
