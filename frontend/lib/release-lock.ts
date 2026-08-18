export const RELEASE_LOCK_SECONDS = 4 * 60 * 60;

/**
 * Newly released episodes are locked for RELEASE_LOCK_SECONDS after they air.
 * `aired_ago` is in seconds (seconds since the episode aired).
 * If `aired_ago` is 0 or negative, the episode is not locked (unknown air time).
 * Returns the epoch-ms timestamp when the episode unlocks, or null if already unlocked.
 */
export function releaseLockUntil(airedAgoSeconds: number, now = Date.now()): number | null {
  if (airedAgoSeconds <= 0) return null; // Unknown air time (e.g., GogoAnime upload) — no lock
  const releasedAt = now - airedAgoSeconds * 1000;
  const until = releasedAt + RELEASE_LOCK_SECONDS * 1000;
  return until > now ? until : null;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 100) return `${h}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
