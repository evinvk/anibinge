interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  staleMs = ttlMs * 2
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expiresAt > now) return hit.value as T;

  try {
    const value = await loader();
    store.set(key, { value, expiresAt: now + ttlMs });
    return value;
  } catch (err) {
    if (hit) {
      hit.expiresAt = now + Math.min(staleMs, 30_000);
      return hit.value as T;
    }
    throw err;
  }
}
