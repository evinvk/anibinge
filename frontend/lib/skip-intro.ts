export interface SkipTimes {
  intro?: number;
  outro?: number;
}

const KEY = "anibinge_skip_times_v1";

export const DEFAULT_INTRO_START = 75;
export const DEFAULT_INTRO_LENGTH = 90;
export const DEFAULT_OUTRO_LENGTH = 100;

function loadAll(): Record<string, SkipTimes> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function getSkipTimes(slug: string): SkipTimes {
  return loadAll()[slug] ?? {};
}

export function recordSkipIntro(slug: string, time: number) {
  const all = loadAll();
  all[slug] = { ...all[slug], intro: Math.round(time) };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

export function recordSkipOutro(slug: string, time: number) {
  const all = loadAll();
  all[slug] = { ...all[slug], outro: Math.round(time) };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
