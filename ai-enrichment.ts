export class EnrichmentParseError extends Error {
  readonly name = 'EnrichmentParseError';
}

export class EnrichmentTimeoutError extends Error {
  readonly name = 'EnrichmentTimeoutError';
}

export class EnrichmentRateLimitError extends Error {
  readonly name = 'EnrichmentRateLimitError';
}

export class EnrichmentUpstreamError extends Error {
  readonly name = 'EnrichmentUpstreamError';
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface EnrichmentTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface EnrichmentPayload {
  suggestion: string;
  confidence: number;
  model?: string;
  tokenUsage?: EnrichmentTokenUsage;
}

export interface EnrichmentResult {
  status: 'complete' | 'partial' | 'unavailable';
  message: string;
  retryAction?: 'retry';
  suggestion?: string;
  confidence?: number;
  errorClass?: string;
}

export interface EnrichmentHttpResponse {
  status: number;
  body: string;
}

export interface EnrichmentAuditEntry {
  requestId: string;
  model: string;
  latencyMs: number;
  tokenUsage: EnrichmentTokenUsage | null;
  errorClass: string | null;
  status: EnrichmentResult['status'];
  retryCount: number;
}

export interface ExecuteEnrichmentOptions {
  requestId: string;
  model: string;
  confidenceThreshold: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetcher: () => Promise<EnrichmentHttpResponse>;
  persistEnrichment?: (payload: EnrichmentPayload) => Promise<void>;
  writeAudit?: (entry: EnrichmentAuditEntry) => Promise<void>;
  log?: (payload: Record<string, unknown>) => void;
}

const SAFE_UNAVAILABLE_MESSAGE = 'AI output unavailable — review source.';
const RATE_LIMIT_MESSAGE = 'AI enrichment unavailable due to quota limits. Please retry shortly.';
const TIMEOUT_MESSAGE = 'AI enrichment timed out. Please retry.';
const UPSTREAM_MESSAGE = 'AI enrichment service is temporarily unavailable. Please retry.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksTruncated(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/premature\s*close|premature\s*closure|unexpected end of json/i.test(trimmed)) return true;
  const opens = (trimmed.match(/\{/g) ?? []).length;
  const closes = (trimmed.match(/\}/g) ?? []).length;
  return (trimmed.startsWith('{') && !trimmed.endsWith('}')) || opens > closes;
}

function validateTokenUsage(input: unknown): EnrichmentTokenUsage | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) {
    throw new EnrichmentParseError('tokenUsage must be an object');
  }

  const keys = Object.keys(input);
  const allowed = ['promptTokens', 'completionTokens', 'totalTokens'];
  if (keys.some((key) => !allowed.includes(key))) {
    throw new EnrichmentParseError('tokenUsage contains unexpected properties');
  }

  const promptTokens = input.promptTokens;
  const completionTokens = input.completionTokens;
  const totalTokens = input.totalTokens;

  if (
    typeof promptTokens !== 'number'
    || typeof completionTokens !== 'number'
    || typeof totalTokens !== 'number'
  ) {
    throw new EnrichmentParseError('tokenUsage fields must be numbers');
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export function validateEnrichmentPayload(input: unknown): EnrichmentPayload {
  if (!isRecord(input)) {
    throw new EnrichmentParseError('Enrichment payload must be an object');
  }

  const keys = Object.keys(input);
  const allowedKeys = ['suggestion', 'confidence', 'model', 'tokenUsage', 'status'];
  if (keys.some((key) => !allowedKeys.includes(key))) {
    throw new EnrichmentParseError('Enrichment payload contains unexpected properties');
  }

  const suggestion = input.suggestion;
  const confidence = input.confidence;
  const model = input.model;

  if (typeof suggestion !== 'string' || suggestion.trim().length === 0) {
    throw new EnrichmentParseError('suggestion must be a non-empty string');
  }
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new EnrichmentParseError('confidence must be a number from 0 to 1');
  }
  if (model !== undefined && typeof model !== 'string') {
    throw new EnrichmentParseError('model must be a string');
  }

  const tokenUsage = validateTokenUsage(input.tokenUsage);

  return {
    suggestion,
    confidence,
    model: typeof model === 'string' ? model : undefined,
    tokenUsage,
  };
}

function parseResponseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    if (looksTruncated(body)) {
      throw new EnrichmentParseError('Truncated enrichment response');
    }
    throw new EnrichmentParseError('Malformed enrichment response JSON');
  }
}

function mapError(error: unknown): { message: string; errorClass: string; retryable: boolean } {
  if (error instanceof EnrichmentTimeoutError) {
    return { message: TIMEOUT_MESSAGE, errorClass: error.name, retryable: true };
  }
  if (error instanceof EnrichmentRateLimitError) {
    return { message: RATE_LIMIT_MESSAGE, errorClass: error.name, retryable: true };
  }
  if (error instanceof EnrichmentUpstreamError) {
    return { message: UPSTREAM_MESSAGE, errorClass: error.name, retryable: error.status >= 500 };
  }
  if (error instanceof EnrichmentParseError) {
    return { message: SAFE_UNAVAILABLE_MESSAGE, errorClass: error.name, retryable: false };
  }
  return { message: SAFE_UNAVAILABLE_MESSAGE, errorClass: 'UnknownEnrichmentError', retryable: false };
}

function backoffDelayMs(attempt: number): number {
  return 250 * (2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new EnrichmentTimeoutError(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function executeEnrichment(options: ExecuteEnrichmentOptions): Promise<EnrichmentResult> {
  const {
    requestId,
    model,
    confidenceThreshold,
    fetcher,
    persistEnrichment,
    writeAudit,
    log,
    timeoutMs = 8_000,
    maxRetries = 3,
  } = options;

  let attempts = 0;
  const totalAttempts = maxRetries + 1;
  let tokenUsage: EnrichmentTokenUsage | null = null;
  const startedAt = Date.now();

  while (attempts < totalAttempts) {
    attempts += 1;

    try {
      const response = await withTimeout(fetcher(), timeoutMs);
      const parsedBody = parseResponseBody(response.body);
      if (!isRecord(parsedBody)) {
        throw new EnrichmentParseError('Response JSON must be an object');
      }

      const upstreamError = typeof parsedBody.error === 'string' ? parsedBody.error : '';
      if (response.status === 429 || /quota|rate limit/i.test(upstreamError)) {
        throw new EnrichmentRateLimitError(upstreamError || 'Rate limit exceeded');
      }
      if (response.status >= 500) {
        throw new EnrichmentUpstreamError(`Upstream ${response.status}`, response.status);
      }
      if (response.status >= 400) {
        throw new EnrichmentUpstreamError(`Upstream ${response.status}`, response.status);
      }

      if (parsedBody.status === 'partial') {
        const result: EnrichmentResult = {
          status: 'partial',
          message: SAFE_UNAVAILABLE_MESSAGE,
          retryAction: 'retry',
          errorClass: 'EnrichmentParseError',
        };

        const latencyMs = Date.now() - startedAt;
        const auditEntry: EnrichmentAuditEntry = {
          requestId,
          model,
          latencyMs,
          tokenUsage,
          errorClass: result.errorClass,
          status: result.status,
          retryCount: attempts - 1,
        };
        await writeAudit?.(auditEntry);
        log?.({ event: 'enrichment_call', ...auditEntry });
        return result;
      }

      const payload = validateEnrichmentPayload(parsedBody);
      tokenUsage = payload.tokenUsage ?? null;

      if (payload.confidence < confidenceThreshold) {
        const result: EnrichmentResult = {
          status: 'unavailable',
          message: SAFE_UNAVAILABLE_MESSAGE,
        };

        const latencyMs = Date.now() - startedAt;
        const auditEntry: EnrichmentAuditEntry = {
          requestId,
          model: payload.model ?? model,
          latencyMs,
          tokenUsage,
          errorClass: null,
          status: result.status,
          retryCount: attempts - 1,
        };
        await writeAudit?.(auditEntry);
        log?.({ event: 'enrichment_call', ...auditEntry });
        return result;
      }

      await persistEnrichment?.(payload);

      const latencyMs = Date.now() - startedAt;
      const result: EnrichmentResult = {
        status: 'complete',
        message: 'AI enrichment applied.',
        suggestion: payload.suggestion,
        confidence: payload.confidence,
      };
      const auditEntry: EnrichmentAuditEntry = {
        requestId,
        model: payload.model ?? model,
        latencyMs,
        tokenUsage,
        errorClass: null,
        status: result.status,
        retryCount: attempts - 1,
      };
      await writeAudit?.(auditEntry);
      log?.({ event: 'enrichment_call', ...auditEntry });
      return result;
    } catch (error) {
      const mapped = mapError(error);
      const isTruncatedParse = error instanceof EnrichmentParseError && /truncated/i.test(error.message);

      if (isTruncatedParse) {
        const latencyMs = Date.now() - startedAt;
        const result: EnrichmentResult = {
          status: 'partial',
          message: SAFE_UNAVAILABLE_MESSAGE,
          retryAction: 'retry',
          errorClass: mapped.errorClass,
        };
        const auditEntry: EnrichmentAuditEntry = {
          requestId,
          model,
          latencyMs,
          tokenUsage,
          errorClass: mapped.errorClass,
          status: result.status,
          retryCount: attempts - 1,
        };
        await writeAudit?.(auditEntry);
        log?.({
          event: 'enrichment_call',
          ...auditEntry,
          validationFailure: true,
        });
        return result;
      }

      if (mapped.retryable && attempts < totalAttempts) {
        await sleep(backoffDelayMs(attempts));
        continue;
      }

      const latencyMs = Date.now() - startedAt;
      const result: EnrichmentResult = {
        status: 'unavailable',
        message: mapped.message,
        errorClass: mapped.errorClass,
      };
      const auditEntry: EnrichmentAuditEntry = {
        requestId,
        model,
        latencyMs,
        tokenUsage,
        errorClass: mapped.errorClass,
        status: result.status,
        retryCount: attempts - 1,
      };
      await writeAudit?.(auditEntry);
      log?.({
        event: 'enrichment_call',
        ...auditEntry,
        validationFailure: error instanceof EnrichmentParseError,
      });
      return result;
    }
  }

  const fallbackResult: EnrichmentResult = {
    status: 'unavailable',
    message: SAFE_UNAVAILABLE_MESSAGE,
    errorClass: 'UnknownEnrichmentError',
  };
  const latencyMs = Date.now() - startedAt;
  const fallbackAudit: EnrichmentAuditEntry = {
    requestId,
    model,
    latencyMs,
    tokenUsage,
    errorClass: fallbackResult.errorClass,
    status: fallbackResult.status,
    retryCount: totalAttempts - 1,
  };
  await writeAudit?.(fallbackAudit);
  log?.({ event: 'enrichment_call', ...fallbackAudit });
  return fallbackResult;
}
