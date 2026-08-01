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

async function resolveAnilistTitle(anilistId: number): Promise<string | null> {
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
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seriesExists(slug: string): Promise<boolean> {
  const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/`);
  if (!html) return false;
  return /data-season="\d+"/.test(html) || /href="\/episode\/[^"]+"/.test(html);
}

async function searchSeries(title: string): Promise<string | null> {
  // The search API is incomplete (e.g. plain "Naruto" is not surfaced) and can
  // match the wrong dub variant, so prefer the direct slug first.
  const directSlug = slugify(title);
  if (directSlug && (await seriesExists(directSlug))) {
    return directSlug;
  }

  const data = await getJson(`${TOONSTREAM_BASE}/search/all?q=${encodeURIComponent(normalize(title))}`, undefined);
  const items = (data?.data || []) as { title?: string; type?: string; url?: string }[];
  const series = items.filter((it) => it.type === "series" && it.url);
  if (!series.length) return null;

  const titles = series.map((it) => it.title || "");
  let best = bestTitleMatch(title, titles);
  // ToonStream names Hindi variants with "-hindi" in the slug/title — prefer
  // those over English/Japanese dub variants since we're resolving Hindi audio.
  const hindiIdx = series.findIndex((it) => /hindi/i.test(`${it.title || ""} ${it.url || ""}`));
  if (hindiIdx >= 0 && (best < 0 || best === hindiIdx || !/hindi/i.test(titles[best] || ""))) {
    best = hindiIdx;
  }
  if (best < 0) best = 0;
  const url = series[best]?.url || "";
  const slug = url.replace(/\/+$/, "").split("/").pop();
  return slug || null;
}

async function getSeasons(slug: string): Promise<number[]> {
  const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/`);
  if (!html) return [];
  const seasons = Array.from(new Set(
    Array.from(html.matchAll(/data-season="(\d+)"/g), (m) => parseInt(m[1]))
  )).sort((a, b) => a - b);
  return seasons.length ? seasons : [1];
}

async function getSeasonEpisodeCount(slug: string, season: number): Promise<number> {
  const html = await getText(`${TOONSTREAM_BASE}/series/${slug}/season/${season}/`);
  if (!html) return 0;
  const epNums: number[] = [];
  for (const m of html.matchAll(/href="(\/episode\/[^"]+)"/g)) {
    const em = m[1].match(/-(\d+)x(\d+)\/?$/);
    if (em && parseInt(em[1]) === season) epNums.push(parseInt(em[2]));
  }
  if (!epNums.length) return 0;
  return Math.max(...epNums);
}

async function mapEpisode(slug: string, episode: number): Promise<{ season: number; ep: number } | null> {
  const seasons = await getSeasons(slug);
  if (!seasons.length) return null;
  let remaining = episode;
  for (const season of seasons) {
    const count = await getSeasonEpisodeCount(slug, season);
    if (count <= 0) continue;
    if (remaining <= count) return { season, ep: remaining };
    remaining -= count;
  }
  const last = seasons[seasons.length - 1];
  const count = await getSeasonEpisodeCount(slug, last);
  return { season: last, ep: count > 0 ? Math.min(remaining, count) : remaining };
}

async function getEpisodeEmbeds(slug: string, season: number, episode: number): Promise<string[]> {
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
}

function fileCodeFromUrl(url: string): string | null {
  const m = url.match(/\/(?:e|embed)\/([^/]+?)(?:\.html)?\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

async function resolveRubystm(fileCode: string, pageUrl: string): Promise<string | null> {
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
      signal: AbortSignal.timeout(20000),
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
}

async function resolveEmbed(embedPath: string): Promise<string | null> {
  const embedUrl = embedPath.startsWith("http") ? embedPath : `${TOONSTREAM_BASE}${embedPath}`;
  const html = await getText(embedUrl, { Referer: `${TOONSTREAM_BASE}/` });
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

  const page = await getText(videoUrl, { Referer: embedUrl });
  return page ? extractM3u8(page) : null;
}

export async function getHindiStream(anilistId: number, episode: number): Promise<HindiStreamResult | null> {
  const title = await resolveAnilistTitle(anilistId);
  if (!title) return null;

  const slug = await searchSeries(title);
  if (!slug) return null;

  const mapped = await mapEpisode(slug, episode);
  if (!mapped) return null;

  const embeds = await getEpisodeEmbeds(slug, mapped.season, mapped.ep);
  for (const embedPath of embeds) {
    try {
      const streamUrl = await resolveEmbed(embedPath);
      if (streamUrl) {
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
    } catch {}
  }
  return null;
}
