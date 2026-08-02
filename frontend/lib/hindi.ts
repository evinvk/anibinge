const TOONSTREAM_BASE = "https://toon-stream.site";
const RUBYSTM_BASE = "https://rubystm.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const SUPPORTED_LANGS = ["hi", "ur", "ta", "te", "en", "ja"] as const;

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface HindiStreamResult {
  source: "toonstream";
  stream_url: string;
  stream_type: "hls";
  referer: string;
  title: string;
  season: number;
  ep: number;
  langs: string[];
}

function toBase(n: number, base: number): string {
  if (n === 0) return DIGITS[0];
  let out = "";
  while (n > 0) {
    out = DIGITS[n % base] + out;
    n = Math.floor(n / base);
  }
  return out;
}

function unpackPacker(payload: string, base: number, count: number, words: string[]): string {
  for (let i = count - 1; i >= 0; i--) {
    if (i >= words.length || !words[i]) continue;
    const token = toBase(i, base);
    payload = payload.replace(
      new RegExp(`(?<![0-9a-zA-Z_])${token}(?![0-9a-zA-Z_])`, "g"),
      () => words[i]
    );
  }
  return payload;
}

function extractM3u8(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/);
  return m ? m[0] : null;
}

function extractFileUrl(decoded: string): string | null {
  const m = decoded.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
  return m ? m[1] : null;
}

function normalize(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestTitleMatch(query: string, candidates: string[]): number {
  const q = normalize(query);
  if (!q) return -1;
  const qTokens = new Set(q.split(" "));
  let bestI = -1;
  let bestScore = -1;
  for (let i = 0; i < candidates.length; i++) {
    const c = normalize(candidates[i]);
    if (!c) continue;
    let score = 0;
    if (c === q) score = 100;
    else if (q.includes(c)) score = 80 + (q.length / Math.max(c.length, 1)) * 20;
    else if (c.includes(q)) score = 70 + (c.length / Math.max(q.length, 1)) * 20;
    else {
      const cTokens = new Set(c.split(" "));
      let overlap = 0;
      qTokens.forEach((t) => { if (cTokens.has(t)) overlap++; });
      const union = qTokens.size + cTokens.size - overlap;
      score = union > 0 ? (overlap / union) * 60 + overlap * 5 : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  return bestScore >= 40 ? bestI : -1;
}

async function getText(url: string, headers: Record<string, string> = {}, timeoutMs = 20000): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (resp.ok) return await resp.text();
  } catch {}
  return null;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (resp.ok) return await resp.json();
  } catch {}
  return null;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const resultCache = new Map<string, { value: unknown; expiresAt: number }>();

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = resultCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;
  const value = await loader();
  resultCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

// Caches null/empty results with a short TTL so dead embeds/series aren't
// re-probed on every request, while successful results live longer.
async function cachedNullable<T>(
  key: string,
  positiveMs: number,
  negativeMs: number,
  loader: () => Promise<T | null>
): Promise<T | null> {
  const now = Date.now();
  const hit = resultCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T | null;
  const value = await loader();
  resultCache.set(key, { value, expiresAt: now + (value == null ? negativeMs : positiveMs) });
  return value;
}

async function resolveAnilistTitle(anilistId: number): Promise<string | null> {
  return cachedNullable(`hindi:title:${anilistId}`, DAY, 5 * MIN, async () => {
    const body = {
      query:
        "query($id:Int){ Media(id:$id,type:ANIME){ title { english romaji native } } }",
      variables: { id: anilistId },
    };
    try {
      const resp = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const t = data?.data?.Media?.title || {};
      return t.english || t.romaji || null;
    } catch {
      return null;
    }
  });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seriesExists(slug: string): Promise<boolean> {
  return (await cachedNullable(`hindi:exists:${slug}`, DAY, 10 * MIN, async () => {
    const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/`);
    if (!html) return null;
    return /data-season="\d+"/.test(html) || /href="\/episode\/[^"]+"/.test(html);
  })) === true;
}

async function searchSeriesCandidates(title: string): Promise<string[]> {
  return cached(`hindi:candidates:${normalize(title)}`, 6 * HOUR, async () => {
    const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (slug: string) => {
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      candidates.push(slug);
    }
  };

  // The search API is incomplete (e.g. plain "Naruto" is not surfaced) and can
  // match the wrong dub variant, so the direct slug is tried first. ToonStream
  // ships Hindi audio under "-hindi"/"-dub" variants, so those are queued as
  // fallbacks in case the plain series only exposes JS-protected embeds.
  const directSlug = slugify(title);
  if (directSlug && (await seriesExists(directSlug))) {
    push(directSlug);
    for (const v of [`${directSlug}-hindi-dub`, `${directSlug}-hindi`, `${directSlug}-dub`]) {
      if (await seriesExists(v)) push(v);
    }
  }

  // Parenthetical suffixes (e.g. "Hunter x Hunter (2011)") break ToonStream's
  // search — strip them from the query, but keep them for the direct slug.
  const searchTitle = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const data = await getJson(`${TOONSTREAM_BASE}/search/all?q=${encodeURIComponent(normalize(searchTitle))}`, undefined);
  const items = (data?.data || []) as { title?: string; type?: string; url?: string }[];
  const series = items.filter((it) => it.type === "series" && it.url);
  if (series.length) {
    const scored = series.map((it) => {
      const t = it.title || "";
      const slug = (it.url || "").replace(/\/+$/, "").split("/").pop() || "";
      return {
        slug,
        score: bestTitleMatch(searchTitle, [t]),
        isHindiDub: /hindi|dub/i.test(`${t} ${it.url || ""}`),
      };
    });
    // Prefer Hindi/dub variants first (we're resolving Hindi audio), then the
    // closest title match.
    scored.sort((a, b) => Number(b.isHindiDub) - Number(a.isHindiDub) || b.score - a.score);
    for (const s of scored) push(s.slug);
  }

  return candidates;
  });
}

async function getSeasons(slug: string): Promise<number[]> {
  return cached(`hindi:seasons:${slug}`, 6 * HOUR, async () => {
    const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/`);
    if (!html) return [];
    const seasons = Array.from(new Set(
      Array.from(html.matchAll(/data-season="(\d+)"/g), (m) => parseInt(m[1]))
    )).sort((a, b) => a - b);
    return seasons.length ? seasons : [1];
  });
}

async function getSeasonEpisodeCount(slug: string, season: number): Promise<number> {
  return cached(`hindi:seascount:${slug}:${season}`, 6 * HOUR, async () => {
    const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/season/${season}/`);
    if (!html) return 0;
    const epNums: number[] = [];
    for (const m of html.matchAll(/href="(\/episode\/[^"]+)"/g)) {
      const em = m[1].match(/-(\d+)x(\d+)\/?$/);
      if (em && parseInt(em[1]) === season) epNums.push(parseInt(em[2]));
    }
    if (!epNums.length) return 0;
    return Math.max(...epNums);
  });
}

async function mapEpisode(slug: string, episode: number): Promise<{ season: number; ep: number } | null> {
  return cachedNullable(`hindi:map:${slug}:${episode}`, 6 * HOUR, 10 * MIN, async () => {
    const seasons = await getSeasons(slug);
    if (!seasons.length) return null;
    // ToonStream numbers episodes globally across seasons and slugs them
    // `{slug}-{S}x{globalEp}` (e.g. "naruto-2x53", "naruto-shippuden-3x54"), so
    // the requested global episode number is matched directly against each
    // season page's links instead of deriving it from cumulative counts.
    for (const season of seasons) {
      const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/season/${season}/`);
      if (!html) continue;
      if (new RegExp(`href="(/episode/[^"]*-${season}x${episode}/)"`).test(html)) {
        return { season, ep: episode };
      }
    }
    const last = seasons[seasons.length - 1];
    const count = await getSeasonEpisodeCount(slug, last);
    return { season: last, ep: count > 0 ? Math.min(episode, count) : episode };
  });
}

async function getEpisodeEmbeds(slug: string, season: number, episode: number): Promise<string[]> {
  return cached(`hindi:embeds:${slug}:${season}:${episode}`, 6 * HOUR, async () => {
    // The episode slug can differ from the series slug (e.g. series
    // "naruto-shippuden-hindi-dub" uses episodes like "naruto-shippuden-1x1"),
    // so derive the episode page URL from the season page's own links.
    const seasonHtml = await getText(`${TOONSTREAM_BASE}/series/${slug}/season/${season}/`);
    const epRe = new RegExp(`href="(/episode/[^"]*-${season}x${episode}/)"`);
    const epPath = seasonHtml ? seasonHtml.match(epRe)?.[1] : null;
    const pageUrl = epPath
      ? `${TOONSTREAM_BASE}${epPath}`
      : `${TOONSTREAM_BASE}/episode/${slug}-${season}x${episode}/`;

    const html = await getText(pageUrl);
    if (!html) return [];
    const embeds: string[] = [];
    for (const tagMatch of html.matchAll(/<iframe\b[^>]*>/gi)) {
      const tag = tagMatch[0];
      const attr = tag.match(/\b(?:src|data-src)="(\/embed\/[^"]+)"/);
      if (attr) embeds.push(attr[1]);
    }
    return embeds;
  });
}

function fileCodeFromUrl(url: string): string | null {
  const m = url.match(/\/(?:e|embed)\/([^/]+?)(?:\.html)?\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

async function resolveRubystm(fileCode: string, pageUrl: string): Promise<string | null> {
  return cachedNullable(`hindi:rubystm:${fileCode}`, 6 * HOUR, 5 * MIN, async () => {
    const body = new URLSearchParams({
      op: "embed",
      file_code: fileCode,
      auto: "1",
      referer: `${TOONSTREAM_BASE}/`,
    });
    let html: string | null = null;
    try {
      const resp = await fetch(`${RUBYSTM_BASE}/dl`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Referer: pageUrl,
          Origin: RUBYSTM_BASE,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (resp.ok) html = await resp.text();
    } catch {}

    if (html) {
      const m = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('(.+)',(\d+),(\d+),'(.+)'\.split\('\|'\)/s);
      if (m) {
        try {
          const decoded = unpackPacker(m[1], parseInt(m[2]), parseInt(m[3]), m[4].split("|"));
          const url = extractFileUrl(decoded);
          if (url) return url;
        } catch {}
      }
      const direct = extractM3u8(html);
      if (direct) return direct;
    }
    return null;
  });
}

async function resolveEmbed(embedPath: string): Promise<string | null> {
  return cachedNullable(`hindi:embed:${embedPath}`, 6 * HOUR, 5 * MIN, async () => {
    const embedUrl = embedPath.startsWith("http") ? embedPath : `${TOONSTREAM_BASE}${embedPath}`;
    const html = await getText(embedUrl, { Referer: `${TOONSTREAM_BASE}/` }, 10000);
    if (!html) return null;

    const direct = extractM3u8(html);
    if (direct) return direct;

    const frame = html.match(/<iframe\b[^>]*src="(https?:\/\/[^"]+)"/i);
    if (!frame) return null;
    const videoUrl = frame[1];

    const fileCode = fileCodeFromUrl(videoUrl);
    if (fileCode && (videoUrl.includes("rubystm.com") || videoUrl.includes("streamruby.com"))) {
      return resolveRubystm(fileCode, videoUrl);
    }

    const page = await getText(videoUrl, { Referer: embedUrl }, 10000);
    return page ? extractM3u8(page) : null;
  });
}

async function resolveFirstSuccess(
  embedPaths: string[],
  deadlineMs: number
): Promise<string | null> {
  let settled = 0;
  let remaining = embedPaths.length;
  return new Promise<string | null>((resolve) => {
    if (!remaining) return resolve(null);
    for (const path of embedPaths) {
      (async () => {
        try {
          const url = await resolveEmbed(path);
          if (url) {
            resolve(url);
            remaining = 0;
          }
        } catch {}
        settled++;
        if (settled === remaining) resolve(null);
      })();
    }
    setTimeout(() => {
      remaining = 0;
      resolve(null);
    }, deadlineMs);
  });
}

async function resolveSlug(slug: string, episode: number, title: string): Promise<HindiStreamResult | null> {
  const mapped = await mapEpisode(slug, episode);
  if (!mapped) return null;

  const embeds = await getEpisodeEmbeds(slug, mapped.season, mapped.ep);
  // Resolve all embeds concurrently, first success wins.
  const streamUrl = await resolveFirstSuccess(embeds, 10000);
  if (!streamUrl) return null;

  return {
    source: "toonstream",
    stream_url: streamUrl,
    stream_type: "hls",
    referer: `${RUBYSTM_BASE}/`,
    title,
    season: mapped.season,
    ep: mapped.ep,
    langs: SUPPORTED_LANGS as unknown as string[],
  };
}

export async function getHindiStream(anilistId: number, episode: number): Promise<HindiStreamResult | null> {
  return cachedNullable(`hindi:stream:${anilistId}:${episode}`, 6 * HOUR, 2 * MIN, async () => {
    const title = await resolveAnilistTitle(anilistId);
    if (!title) return null;

    const slugs = await searchSeriesCandidates(title);
    // Probe all candidate slugs concurrently and return the first success. This
    // avoids stalling on a series whose embeds are all dead (e.g. plain
    // "bleach" -> gdmirrorbot/abyssplayer/vidstreaming) before reaching the
    // working "-dub"/"-hindi" variant.
    return await resolveFirstSlug(slugs, episode, title, 15000);
  });
}

async function resolveFirstSlug(
  slugs: string[],
  episode: number,
  title: string,
  deadlineMs: number
): Promise<HindiStreamResult | null> {
  const deadline = Date.now() + deadlineMs;
  let cursor = 0;
  let done = false;
  let pending = 0;
  return new Promise<HindiStreamResult | null>((resolve) => {
    const finish = () => {
      if (!done && pending === 0) {
        done = true;
        resolve(null);
      }
    };
    const worker = async () => {
      while (!done && Date.now() < deadline) {
        const idx = cursor++;
        if (idx >= slugs.length) break;
        pending++;
        try {
          const result = await resolveSlug(slugs[idx], episode, title);
          if (result && !done) {
            done = true;
            resolve(result);
            return;
          }
        } catch {}
        pending--;
        if (!done) finish();
      }
      finish();
    };
    const workers = Math.min(3, slugs.length);
    for (let i = 0; i < workers; i++) worker();
    setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, deadlineMs);
  });
}
