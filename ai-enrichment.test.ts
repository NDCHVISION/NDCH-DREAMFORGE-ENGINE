import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EnrichmentParseError,
  executeEnrichment,
  validateEnrichmentPayload,
} from './ai-enrichment.ts';

test('validateEnrichmentPayload accepts strict valid payload', () => {
  const payload = validateEnrichmentPayload({
    suggestion: 'Consider ECG and serial troponins.',
    confidence: 0.91,
    model: 'gemini-1.5-pro',
    tokenUsage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  });

  assert.equal(payload.suggestion, 'Consider ECG and serial troponins.');
  assert.equal(payload.confidence, 0.91);
});

test('validateEnrichmentPayload rejects schema mismatch and unexpected keys', () => {
  assert.throws(
    () => {
      validateEnrichmentPayload({
        suggestion: 'x',
        confidence: 0.9,
        foo: 'bar',
      });
    },
    EnrichmentParseError,
  );
});

test('executeEnrichment retries rate limits and eventually succeeds', async () => {
  let attempts = 0;
  let persistedSuggestion = '';

  const result = await executeEnrichment({
    requestId: 'req-1',
    model: 'gemini-1.5-pro',
    confidenceThreshold: 0.7,
    maxRetries: 3,
    fetcher: async () => {
      attempts += 1;
      if (attempts < 3) {
        return {
          status: 429,
          body: JSON.stringify({ error: 'billing quota depleted' }),
        };
      }

      return {
        status: 200,
        body: JSON.stringify({
          suggestion: 'Add aspirin unless contraindicated.',
          confidence: 0.95,
        }),
      };
    },
    persistEnrichment: async (payload) => {
      persistedSuggestion = payload.suggestion;
    },
  });

  assert.equal(result.status, 'complete');
  assert.equal(persistedSuggestion, 'Add aspirin unless contraindicated.');
  assert.equal(attempts, 3);
});

test('executeEnrichment does not retry malformed JSON parse failures', async () => {
  let attempts = 0;

  const result = await executeEnrichment({
    requestId: 'req-2',
    model: 'gemini-1.5-pro',
    confidenceThreshold: 0.7,
    maxRetries: 3,
    fetcher: async () => {
      attempts += 1;
      return {
        status: 200,
        body: 'not-json',
      };
    },
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.message, 'AI output unavailable — review source.');
  assert.equal(attempts, 1);
});

test('executeEnrichment flags truncated responses as partial with retry action', async () => {
  const result = await executeEnrichment({
    requestId: 'req-3',
    model: 'gemini-1.5-pro',
    confidenceThreshold: 0.7,
    fetcher: async () => ({
      status: 200,
      body: '{"suggestion":"incomplete"',
    }),
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.retryAction, 'retry');
});

test('executeEnrichment applies confidence safety gate', async () => {
  let persisted = false;

  const result = await executeEnrichment({
    requestId: 'req-4',
    model: 'gemini-1.5-pro',
    confidenceThreshold: 0.8,
    fetcher: async () => ({
      status: 200,
      body: JSON.stringify({
        suggestion: 'Low confidence idea',
        confidence: 0.4,
      }),
    }),
    persistEnrichment: async () => {
      persisted = true;
    },
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.message, 'AI output unavailable — review source.');
  assert.equal(persisted, false);
});
