/**
 * In-memory token-bucket rate limiter (per-process).
 * Suitable for local / single-node Next.js. For multi-instance deploy, swap to Redis.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimit(opts: {
  key: string;
  /** Max tokens in the bucket. */
  capacity: number;
  /** Tokens refilled per second. */
  refillPerSec: number;
  /** Cost of this request (default 1). */
  cost?: number;
}): RateLimitResult {
  const now = Date.now();
  const cost = opts.cost ?? 1;
  let b = buckets.get(opts.key);
  if (!b) {
    b = { tokens: opts.capacity, updatedAt: now };
    buckets.set(opts.key, b);
  }
  const elapsed = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * opts.refillPerSec);
  b.updatedAt = now;
  if (b.tokens < cost) {
    const need = cost - b.tokens;
    const retryAfterMs = Math.ceil((need / opts.refillPerSec) * 1000);
    return { ok: false, remaining: Math.floor(b.tokens), retryAfterMs };
  }
  b.tokens -= cost;
  return { ok: true, remaining: Math.floor(b.tokens), retryAfterMs: 0 };
}

/** Best-effort client key from request headers / IP. */
export function clientKey(request: Request, suffix = ""): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  const ip = fwd || real || "local";
  return `${ip}:${suffix}`;
}

/** Periodic prune so the Map cannot grow unbounded. */
setInterval(() => {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [k, b] of buckets) {
    if (b.updatedAt < cutoff) buckets.delete(k);
  }
}, 60_000).unref?.();
