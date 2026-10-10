/** Small fetch wrapper: spacing between requests, retries with backoff on 429/5xx. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    url: string,
  ) {
    super(`HTTP ${status} from ${url.replace(/([?&](api_key|key)=)[^&]+/gi, "$1***")}: ${body.slice(0, 300)}`);
  }
}

export function createClient(opts: { minIntervalMs: number; maxRetries?: number; timeoutMs?: number }) {
  let last = 0;
  const maxRetries = opts.maxRetries ?? 6;

  return async function request(url: string, init: RequestInit = {}): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const wait = last + opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        await sleep(backoff(attempt));
        continue;
      }
      if (res.ok) return res.json();
      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) throw new HttpError(res.status, body, url);
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
    }
  };
}

const backoff = (attempt: number) => Math.min(60_000, 1000 * 2 ** attempt) + Math.random() * 500;
