/**
 * Best-effort per-instance sliding-window limiter.
 * Booth Wi-Fi may NAT many visitors behind one IP, so the limit is generous.
 * Not shared across instances — good enough to blunt scripted spam for a 1-event page.
 */
const WINDOW_MS = 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

export function rateLimit(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear(); // memory guard
  return true;
}
