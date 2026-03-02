type FetchRetryOptions = {
  attempts: number;
  perAttemptTimeoutMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

const DEFAULT_OPTS: FetchRetryOptions = {
  attempts: 3,
  perAttemptTimeoutMs: 12000,
  baseDelayMs: 500,
  maxDelayMs: 2500,
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value: string | null): number | null => {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
};

const getBackoffMs = (
  attempt: number,
  retryAfterMs: number | null,
  opts: FetchRetryOptions
) => {
  if (retryAfterMs != null) return Math.min(opts.maxDelayMs, retryAfterMs);
  const exp = opts.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(opts.maxDelayMs, exp + jitter);
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: Partial<FetchRetryOptions>
): Promise<Response> {
  const opts = { ...DEFAULT_OPTS, ...(options || {}) };
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(opts.perAttemptTimeoutMs),
      });

      if (!RETRYABLE_STATUS.has(res.status) || attempt === opts.attempts) {
        return res;
      }

      const delayMs = getBackoffMs(
        attempt,
        parseRetryAfterMs(res.headers.get("retry-after")),
        opts
      );
      await sleep(delayMs);
      continue;
    } catch (err) {
      lastError = err;
      if (attempt === opts.attempts) throw err;
      const delayMs = getBackoffMs(attempt, null, opts);
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("retry_failed");
}
