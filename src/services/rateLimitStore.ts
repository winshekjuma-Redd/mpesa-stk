const store = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  if (current.count >= max) return false;

  current.count += 1;
  store.set(key, current);
  return true;
}
