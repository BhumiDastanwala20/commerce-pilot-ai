const g = globalThis as unknown as { __hits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__hits ??= new Map());

// Returns false when the caller has exceeded `limit` requests in `windowMs`
export function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}