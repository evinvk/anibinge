export interface WatchHistoryEntry {
  slug: string;
  title: string;
  image?: string | null;
  ep: number;
  time: number;
  duration: number;
  updatedAt: number;
  watchedEps: number[];
}

const BASE_KEY = "anibinge_watch_history_v1";
const MAX_ENTRIES = 60;

function storeKey(scope: string): string {
  return scope ? `${BASE_KEY}_${scope}` : BASE_KEY;
}

export function loadHistory(scope: string): WatchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storeKey(scope));
    const list: WatchHistoryEntry[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(scope: string, entries: WatchHistoryEntry[]) {
  try {
    localStorage.setItem(storeKey(scope), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* storage full — ignore */ }
}

export function getEntry(scope: string, slug: string): WatchHistoryEntry | null {
  return loadHistory(scope).find((e) => e.slug === slug) ?? null;
}

export function saveProgress(
  scope: string,
  data: { slug: string; title: string; image?: string | null; ep: number; time: number; duration: number }
) {
  const list = loadHistory(scope);
  const idx = list.findIndex((e) => e.slug === data.slug);
  const watchedEps = idx >= 0 ? list[idx].watchedEps : [];
  const watched = data.duration > 30 && data.time / data.duration >= 0.85;
  const next: WatchHistoryEntry = {
    slug: data.slug,
    title: data.title,
    image: data.image ?? (idx >= 0 ? list[idx].image : null),
    ep: watched ? Math.min(data.ep + 1, data.duration ? data.ep + 1 : data.ep) : data.ep,
    time: watched ? 0 : data.time,
    duration: data.duration,
    updatedAt: Date.now(),
    watchedEps: watched && !watchedEps.includes(data.ep) ? [...watchedEps, data.ep] : watchedEps,
  };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  save(scope, list);
  return next;
}

export function markWatched(scope: string, slug: string, title: string, ep: number) {
  const list = loadHistory(scope);
  const idx = list.findIndex((e) => e.slug === slug);
  if (idx >= 0) {
    const e = list[idx];
    if (!e.watchedEps.includes(ep)) e.watchedEps = [...e.watchedEps, ep];
    e.updatedAt = Date.now();
    list[idx] = e;
  } else {
    list.unshift({ slug, title, image: null, ep, time: 0, duration: 0, updatedAt: Date.now(), watchedEps: [ep] });
  }
  save(scope, list);
}

export function removeEntry(scope: string, slug: string) {
  save(scope, loadHistory(scope).filter((e) => e.slug !== slug));
}

export function isEpWatched(scope: string, slug: string, ep: number): boolean {
  return loadHistory(scope).find((e) => e.slug === slug)?.watchedEps?.includes(ep) ?? false;
}
