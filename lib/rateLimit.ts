/**
 * In-memory rate limiter for Next.js API routes.
 *
 * LIMITATION: This uses module-level state, which means each serverless
 * instance (Vercel) maintains its own counter. A distributed attacker
 * hitting different instances can bypass the limit. For true global rate
 * limiting, use Upstash Redis or Vercel Edge Config.
 *
 * For a 5-person team with shared credentials, this is sufficient as a
 * defense-in-depth layer against single-IP brute-force attempts.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Evict expired entries periodically to prevent unbounded memory growth
const EVICT_INTERVAL_MS = 60_000;
let lastEviction = Date.now();

function evictExpired() {
  const now = Date.now();
  if (now - lastEviction < EVICT_INTERVAL_MS) return;
  lastEviction = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check (and increment) the rate limit for a given key.
 * Returns whether the request is allowed and metadata for response headers.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  evictExpired();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      retryAfterMs: 0,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    retryAfterMs: 0,
  };
}

/**
 * Reset the rate limit for a given key (e.g. after a successful login).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}
