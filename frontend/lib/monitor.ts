import { query } from "@/lib/db";

export interface CheckResult {
  key: string;
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  latency_ms: number;
}

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(
  /^https?:\/\/anibinge\.fun(?=$|\/)/,
  "https://www.anibinge.fun"
);

const CORE_PAGES: [string, string][] = [
  ["/", "Home"],
  ["/browse", "Browse"],
  ["/search", "Search"],
  ["/recent", "Latest Releases"],
  ["/seasonal", "Seasonal"],
  ["/schedule", "Schedule"],
  ["/news", "News"],
  ["/manhwa", "Manhwa"],
  ["/hindi-anime", "Hindi Dubs"],
  ["/donghua", "Donghua"],
  ["/studios", "Studios"],
  ["/genres/action", "Genre: Action"],
];

const API_CHECKS: [string, string][] = [
  ["/api/v1/anime/trending", "API Trending"],
  ["/api/v1/anime/top-rated", "API Top Rated"],
  ["/api/v1/anime/upcoming", "API Upcoming"],
  ["/api/v1/anime/airing", "API Airing"],
  ["/api/v1/streaming/recent", "API Recent Releases"],
  ["/api/v1/manhwa/latest", "API Manhwa Latest"],
  ["/api/v1/search?q=one+piece", "API Search"],
  ["/api/v1/streaming/gogoanime/health", "Gogo Health"],
];

const ANIVEXA_FALLBACKS: [number, string][] = [
  [21, "One Piece"],
  [52991, "Frieren"],
];

async function fetchWithTimeout(url: string, timeoutMs = 20000): Promise<Response> {
  return fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Anibinge-Monitor/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function fail(key: string, name: string, url: string, error: string, start: number): CheckResult {
  return { key, name, url, ok: false, error, latency_ms: Date.now() - start };
}

function ok(key: string, name: string, url: string, start: number): CheckResult {
  return { key, name, url, ok: true, latency_ms: Date.now() - start };
}

async function checkPage(path: string, name: string): Promise<CheckResult> {
  const url = `${SITE}${path}`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url);
    return res.ok ? ok(`page:${path}`, name, url, start) : fail(`page:${path}`, name, url, `HTTP ${res.status}`, start);
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed";
    return fail(`page:${path}`, name, url, msg, start);
  }
}

async function checkApi(path: string, name: string, minItems = 0): Promise<CheckResult> {
  const url = `${SITE}${path}`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, 30000);
    const body = await res.json().catch(() => null);
    if (!res.ok) return fail(path, name, url, `HTTP ${res.status}`, start);
    const arr = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null;
    if (minItems > 0 && (!arr || arr.length < minItems)) {
      return fail(path, name, url, `expected ${minItems}+ items, got ${arr?.length ?? "none"}`, start);
    }
    return ok(path, name, url, start);
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed";
    return fail(path, name, url, msg, start);
  }
}

async function checkGogoStreams(runOffset: number): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Pull fresh valid slugs from the live catalog (rotates pages each run)
  const pageNum = 1 + (runOffset % 5);
  const latestUrl = `${SITE}/api/v1/streaming/gogoanime/latest?page=${pageNum}`;
  const start = Date.now();
  let slugs: string[] = [];
  try {
    const res = await fetchWithTimeout(latestUrl, 30000);
    const body = await res.json().catch(() => null);
    const arr = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    slugs = arr.map((x: any) => x.slug).filter((s: any) => typeof s === "string" && s.length > 3).slice(0, 30);
    if (!res.ok) {
      results.push(fail("gogo:latest", "Gogo latest catalog", latestUrl, `HTTP ${res.status}`, start));
    } else if (slugs.length < 10) {
      results.push(fail("gogo:latest", "Gogo latest catalog", latestUrl, `empty catalog (${slugs.length} slugs)`, start));
    } else {
      results.push(ok("gogo:latest", "Gogo latest catalog", latestUrl, start));
    }
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed";
    results.push(fail("gogo:latest", "Gogo latest catalog", latestUrl, msg, start));
    return results;
  }

  // Rotate: start at a different offset every run so all slugs get covered over time
  const sampleSize = Math.min(5, Math.max(2, Math.floor(slugs.length / 6)));
  const selected: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const slug = slugs[(runOffset * sampleSize + i) % slugs.length];
    if (slug) selected.push(slug);
  }
  const streamChecks = await Promise.all(selected.map((slug) => checkOneStream(slug)));
  for (const checks of streamChecks) results.push(...checks);
  return results;
}

async function checkOneStream(slug: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const infoUrl = `${SITE}/api/v1/streaming/gogoanime/${slug}/info`;
  const t = Date.now();
  try {
    const res = await fetchWithTimeout(infoUrl, 30000);
    const body = await res.json().catch(() => null);
    const title = body?.data?.title;
    if (res.ok && title) results.push(ok(`stream:${slug}:info`, `Info: ${slug}`, infoUrl, t));
    else results.push(fail(`stream:${slug}:info`, `Info: ${slug}`, infoUrl, !res.ok ? `HTTP ${res.status}` : "no title", t));
  } catch (e: any) {
    results.push(fail(`stream:${slug}:info`, `Info: ${slug}`, infoUrl, e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed", t));
  }

  const streamUrl = `${SITE}/api/v1/streaming/gogoanime/${slug}/stream?ep=1&audio=sub`;
  const t2 = Date.now();
  try {
    const res = await fetchWithTimeout(streamUrl, 30000);
    const body = await res.json().catch(() => null);
    const d = body?.data;
    const playable = d?.direct_stream?.stream_url || d?.master_m3u8 || (Array.isArray(d?.qualities) && d.qualities.length > 0) || d?.embed_url;
    if (!res.ok) {
      results.push(fail(`stream:${slug}:stream`, `Stream: ${slug}`, streamUrl, `HTTP ${res.status}`, t2));
      return results;
    }
    if (!playable) {
      results.push(fail(`stream:${slug}:stream`, `Stream: ${slug}`, streamUrl, "no playable source", t2));
      return results;
    }
    results.push(ok(`stream:${slug}:stream`, `Stream: ${slug}`, streamUrl, t2));

    // Deep check: actually fetch the stream through the proxy and verify it's a playlist
    if (d?.direct_stream?.stream_url) {
      const proxUrl = `${SITE}/api/proxy?url=${encodeURIComponent(d.direct_stream.stream_url)}&referer=${encodeURIComponent(d.direct_stream.referer || "https://anidb.app/")}`;
      const t3 = Date.now();
      try {
        const pRes = await fetchWithTimeout(proxUrl, 25000);
        const text = await pRes.text().catch(() => "");
        const isPlaylist = pRes.ok && (text.includes("#EXTM3U") || (pRes.headers.get("content-type") || "").includes("mpegurl"));
        if (isPlaylist) results.push(ok(`stream:${slug}:playback`, `Playback: ${slug}`, proxUrl, t3));
        else results.push(fail(`stream:${slug}:playback`, `Playback: ${slug}`, proxUrl, `not a playlist (HTTP ${pRes.status})`, t3));
      } catch (e: any) {
        results.push(fail(`stream:${slug}:playback`, `Playback: ${slug}`, proxUrl, e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed", t3));
      }
    }
  } catch (e: any) {
    results.push(fail(`stream:${slug}:stream`, `Stream: ${slug}`, streamUrl, e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed", t2));
  }

  return results;
}

async function checkAnivexaFallbacks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const [id, name] of ANIVEXA_FALLBACKS) {
    const url = `${SITE}/api/v1/streaming/anivexa/${id}/stream?ep=1&audio=sub`;
    const t = Date.now();
    try {
      const res = await fetchWithTimeout(url, 30000);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.stream_url) results.push(ok(`anivexa:${id}`, `Anivexa: ${name}`, url, t));
      else results.push(fail(`anivexa:${id}`, `Anivexa: ${name}`, url, !res.ok ? `HTTP ${res.status}` : "no stream_url", t));
    } catch (e: any) {
      results.push(fail(`anivexa:${id}`, `Anivexa: ${name}`, url, e?.name === "TimeoutError" ? "timeout" : e?.message || "fetch failed", t));
    }
  }
  return results;
}

export async function runHealthCheck(): Promise<{
  run_id: number;
  total: number;
  passed: number;
  failed: number;
  duration_ms: number;
}> {
  const runOffset = Date.now() % 1_000_000; // deterministic-ish rotation seed
  const startedAt = Date.now();

  const batch: Promise<CheckResult>[] = [
    ...CORE_PAGES.map(([p, n]) => checkPage(p, n)),
    ...API_CHECKS.map(([p, n]) => checkApi(p, n, 1)),
  ];

  const settled = await Promise.allSettled([...batch, checkGogoStreams(runOffset), checkAnivexaFallbacks()]);
  const results: CheckResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      if (Array.isArray(s.value)) results.push(...s.value);
      else if (s.value) results.push(s.value);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const durationMs = Date.now() - startedAt;

  const [rows] = await query<{ id: number }>(
    `INSERT INTO health_runs (duration_ms, total, passed, failed) VALUES ($1, $2, $3, $4) RETURNING id`,
    [durationMs, results.length, passed, failed]
  );
  const runId = rows.id;

  for (const r of results) {
    await query(
      "INSERT INTO health_checks (run_id, key, name, url, ok, error, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [runId, r.key, r.name, r.url, r.ok, r.error ?? null, r.latency_ms]
    );
  }

  return { run_id: runId, total: results.length, passed, failed, duration_ms: durationMs };
}