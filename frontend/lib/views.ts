import fs from "fs";
import path from "path";

let memCache: Record<string, number> = {};
let memDirty = false;

function getViewsFile(): string {
  try {
    const dir = process.cwd();
    if (!fs.existsSync(dir)) return "/tmp/.views.json";
    try {
      fs.accessSync(path.join(dir, ".views.json"), fs.constants.F_OK);
      return path.join(dir, ".views.json");
    } catch {
      try {
        fs.accessSync(dir, fs.constants.W_OK);
        fs.writeFileSync(path.join(dir, ".views.json"), "{}");
        return path.join(dir, ".views.json");
      } catch {
        return "/tmp/.views.json";
      }
    }
  } catch {
    return "/tmp/.views.json";
  }
}

function readViews(): Record<string, number> {
  if (Object.keys(memCache).length > 0) return memCache;
  try {
    const file = getViewsFile();
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf-8");
    memCache = JSON.parse(raw);
    return memCache;
  } catch {
    return {};
  }
}

function writeViews(data: Record<string, number>): void {
  memCache = data;
  try {
    const file = getViewsFile();
    fs.writeFileSync(file, JSON.stringify(data), "utf-8");
  } catch {}
}

export function getViewCount(id: string | number): number {
  const views = readViews();
  return views[String(id)] || 0;
}

export function incrementView(id: string | number): number {
  const views = readViews();
  const key = String(id);
  views[key] = (views[key] || 0) + 1;
  writeViews(views);
  return views[key];
}

export function getBatchViews(ids: (string | number)[]): Record<string, number> {
  const views = readViews();
  const result: Record<string, number> = {};
  for (const id of ids) {
    result[String(id)] = views[String(id)] || 0;
  }
  return result;
}

export function enrichWithViews<T extends { id: number | string }>(items: T[]): (T & { site_views: number })[] {
  const ids = items.map((i) => i.id);
  const views = getBatchViews(ids);
  return items.map((item) => ({ ...item, site_views: views[String(item.id)] || 0 }));
}
