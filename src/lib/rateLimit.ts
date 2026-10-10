/**
 * A pause switch for a feature whose free AI quota ran out. After `trip()` the feature answers instantly with
 * "unavailable" for `ms` milliseconds, instead of making every visitor wait for calls that are sure to fail.
 */
export function createCooldown(ms: number) {
  let until = 0;
  return {
    active: () => Date.now() < until,
    trip: () => {
      until = Date.now() + ms;
    },
  };
}

/**
 * Best-effort in-memory limiter per client key (usually the IP). Each server instance counts on its own, so
 * it protects free API quotas from a single noisy visitor, not from a determined attacker.
 */
export function createRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, number[]>();

  /** Records a request for `key` and returns true when the key is over its limit. */
  return function rateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxRequests) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return false;
  };
}
