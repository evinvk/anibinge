"""
Hindi anime streaming client — resolves Hindi-dubbed streams from ToonStream.

Flow:
  1. Search ToonStream by title (/search/all?q=) -> series slug
  2. Series page -> season buttons; season page -> episode links
  3. Episode page -> active embed iframes (/embed/{hex})
  4. Embed page -> rubystm.com/e/{file_code}.html
  5. POST rubystm.com/dl with file_code -> P.A.C.K.E.R.-obfuscated JWPlayer
  6. Unpack -> direct HLS master URL (multi-language audio: hi/ur/ta/te/en/ja)

The returned HLS master is time-limited (tokens expire after ~9h), so it is
never cached for long. The frontend plays it through the /api/proxy route
which rewrites every variant/audio/segment URL with the proper Referer.
"""
import logging
import re
import unicodedata
from typing import Any

import httpx

from app.core.cache import cached
from app.core.http import get_shared_client
from app.services import anilist_client

logger = logging.getLogger("anibinge.hindi")

TOONSTREAM_BASE = "https://toon-stream.site"
RUBYSTM_BASE = "https://rubystm.com"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

_PACKER_RE = re.compile(
    r"eval\(function\(p,a,c,k,e,d\)\{.*?\}\('(.+)',(\d+),(\d+),'(.+)'\.split\('\|'\)",
    re.DOTALL,
)

# Audio tracks present in streamruby masters, in the order they appear.
_SUPPORTED_LANGS = ("hi", "ur", "ta", "te", "en", "ja")

_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = get_shared_client(timeout=25.0, headers={"User-Agent": _UA})
    return _client


def _to_base(n: int, base: int) -> str:
    """JS Number.toString(base) equivalent (digits 0-9a-zA-Z)."""
    if n == 0:
        return _DIGITS[0]
    out = []
    while n > 0:
        out.append(_DIGITS[n % base])
        n //= base
    return "".join(reversed(out))


def _unpack(payload: str, base: int, count: int, words: list[str]) -> str:
    """
    Decode a Dean Edwards P.A.C.K.E.R.-packed string.

    Mirrors the JS unpacker:
        while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    """
    for i in range(count - 1, -1, -1):
        if i >= len(words) or not words[i]:
            continue
        token = _to_base(i, base)
        payload = re.sub(
            rf"(?<![0-9a-zA-Z_]){re.escape(token)}(?![0-9a-zA-Z_])",
            words[i],
            payload,
        )
    return payload


def _extract_m3u8(text: str) -> str | None:
    """Find a direct .m3u8 URL inside raw HTML/JS text."""
    m = re.search(r'https?://[^\s"\'<>\\]+\.m3u8[^\s"\'<>\\]*', text)
    return m.group(0) if m else None


def _extract_file_url(decoded: str) -> str | None:
    """Extract the JWPlayer sources[0].file URL from an unpacked config."""
    m = re.search(r'file\s*:\s*["\'](https?://[^"\']+\.m3u8[^"\']*)["\']', decoded)
    return m.group(1) if m else None


async def _get(
    url: str,
    headers: dict | None = None,
    params: dict | None = None,
) -> httpx.Response:
    client = await _get_client()
    return await client.get(
        url,
        headers=headers,
        params=params,
        timeout=httpx.Timeout(20.0, connect=10.0),
        follow_redirects=True,
    )


async def _post(url: str, data: dict, headers: dict | None = None) -> httpx.Response:
    client = await _get_client()
    return await client.post(url, data=data, headers=headers, timeout=httpx.Timeout(20.0, connect=10.0))


def _normalize(title: str) -> str:
    t = unicodedata.normalize("NFD", title.lower().strip())
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    t = re.sub(r"['`]", "", t)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _best_title_match(query: str, candidates: list[str]) -> int:
    """Return the index of the best-matching candidate title, or -1."""
    q = _normalize(query)
    if not q:
        return -1
    q_tokens = set(q.split())
    best_i = -1
    best_score = -1.0
    for i, cand in enumerate(candidates):
        c = _normalize(cand)
        if not c:
            continue
        if c == q:
            score = 100.0
        elif q in c:
            score = 80.0 + (len(q) / max(len(c), 1)) * 20
        elif c in q:
            score = 70.0 + (len(c) / max(len(q), 1)) * 20
        else:
            c_tokens = set(c.split())
            if q_tokens and c_tokens:
                overlap = len(q_tokens & c_tokens)
                union = len(q_tokens | c_tokens)
                score = (overlap / union) * 60.0 + overlap * 5
            else:
                score = 0.0
        if score > best_score:
            best_score = score
            best_i = i
    return best_i if best_score >= 40.0 else -1


def _slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


async def _series_exists(slug: str) -> bool:
    try:
        resp = await _get(f"{TOONSTREAM_BASE}/series/{slug}/")
        if resp.status_code != 200:
            return False
        html = resp.text
    except Exception:
        return False
    return bool(re.search(r'data-season="\d+"', html) or re.search(r'href="/episode/[^"]+"', html))


@cached("hindi:search", ttl=86400)
async def search_series(title: str) -> str | None:
    """Find a ToonStream series slug for a title.

    The search API is incomplete (e.g. plain "Naruto" is not surfaced) and can
    match the wrong dub variant, so the direct slug is preferred first.
    """
    direct = _slugify(title)
    if direct and await _series_exists(direct):
        return direct

    # Parenthetical suffixes (e.g. "Hunter x Hunter (2011)") break ToonStream's
    # search — strip them from the query, but keep them for the direct slug.
    search_title = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", " ", title)).strip()

    try:
        resp = await _get(f"{TOONSTREAM_BASE}/search/all", params={"q": _normalize(search_title)})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("ToonStream search failed for %r: %s", title, e)
        return None

    items = data.get("data", []) or []
    series = [it for it in items if it.get("type") == "series" and it.get("url")]
    if not series:
        return None

    titles = [it.get("title", "") for it in series]
    best = _best_title_match(search_title, titles)
    # ToonStream names Hindi variants with "-hindi" in the slug/title — prefer
    # those over English/Japanese dub variants since we're resolving Hindi audio.
    hindi_idx = next(
        (
            i
            for i, it in enumerate(series)
            if "hindi" in f"{it.get('title', '')} {it.get('url', '')}".lower()
        ),
        -1,
    )
    if hindi_idx >= 0 and (best < 0 or best == hindi_idx or "hindi" not in titles[best].lower()):
        best = hindi_idx
    if best < 0:
        best = 0
    url = series[best].get("url", "")
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    logger.info("ToonStream: %r -> series %r", title, slug)
    return slug or None


@cached("hindi:seasons", ttl=86400)
async def get_seasons(slug: str) -> list[int]:
    """Get the season numbers available for a series (from the series page)."""
    try:
        resp = await _get(f"{TOONSTREAM_BASE}/series/{slug}/")
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.warning("ToonStream seasons failed for %r: %s", slug, e)
        return []

    seasons = [int(n) for n in re.findall(r'data-season="(\d+)"', html)]
    seasons = sorted(set(seasons))
    if not seasons:
        seasons = [1]
    return seasons


@cached("hindi:season_count", ttl=86400)
async def get_season_episode_count(slug: str, season: int) -> int:
    """Count episodes listed on a series season page."""
    try:
        resp = await _get(f"{TOONSTREAM_BASE}/series/{slug}/season/{season}/")
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.warning("ToonStream season page failed for %r s%d: %s", slug, season, e)
        return 0

    episodes = re.findall(r'href="(/episode/[^"]+)"', html)
    ep_nums = []
    for path in episodes:
        m = re.search(r"-(\d+)x(\d+)/?$", path)
        if m and int(m.group(1)) == season:
            ep_nums.append(int(m.group(2)))
    count = max(ep_nums) if ep_nums else len(episodes)
    return count


@cached("hindi:episode_map", ttl=86400)
async def map_episode(slug: str, episode: int) -> tuple[int, int] | None:
    """
    Map a global (AniList-style) episode number to (season, ep) on ToonStream.

    ToonStream numbers episodes globally across seasons and slugs them
    `{slug}-{S}x{globalEp}` (e.g. "naruto-2x53", "naruto-shippuden-3x54"), so
    the requested global episode number is matched directly against each
    season page's links instead of deriving it from cumulative per-season
    counts (which produced wrong seasons / missing episodes past S1).
    """
    seasons = await get_seasons(slug)
    if not seasons:
        return None
    for season in seasons:
        try:
            resp = await _get(f"{TOONSTREAM_BASE}/series/{slug}/season/{season}/")
            resp.raise_for_status()
            html = resp.text
        except Exception as e:
            logger.warning("ToonStream season page failed for %r s%d: %s", slug, season, e)
            continue
        if re.search(rf'href="(/episode/[^"]*-{season}x{episode}/)"', html):
            return season, episode
    last = seasons[-1]
    count = await get_season_episode_count(slug, last)
    if count <= 0:
        count = episode
    return last, min(episode, count)


@cached("hindi:episode_embeds", ttl=3600)
async def get_episode_embeds(slug: str, season: int, episode: int) -> list[str]:
    """Get the embed paths for an episode page, active player first.

    The episode slug can differ from the series slug (e.g. series
    "naruto-shippuden-hindi-dub" uses episodes like "naruto-shippuden-1x1"),
    so the episode page URL is derived from the season page's own links.
    """
    try:
        season_resp = await _get(f"{TOONSTREAM_BASE}/series/{slug}/season/{season}/")
        season_resp.raise_for_status()
        season_html = season_resp.text
    except Exception as e:
        logger.warning("ToonStream season page failed for %r s%d: %s", slug, season, e)
        season_html = ""

    ep_match = re.search(rf'href="(/episode/[^"]*-{season}x{episode}/)"', season_html)
    page_url = (
        f"{TOONSTREAM_BASE}{ep_match.group(1)}"
        if ep_match
        else f"{TOONSTREAM_BASE}/episode/{slug}-{season}x{episode}/"
    )

    try:
        resp = await _get(page_url)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.warning("ToonStream episode page failed for %r %dx%d: %s", slug, season, episode, e)
        return []

    embeds = []
    for m in re.finditer(r"<iframe\b[^>]*>", html, re.IGNORECASE):
        tag = m.group(0)
        attr = re.search(r'\b(?:src|data-src)="(/embed/[^"]+)"', tag)
        if attr:
            embeds.append(attr.group(1))
    return embeds


def _file_code_from_url(url: str) -> str | None:
    """Extract the file code from a rubystm /e/{code}.html URL."""
    m = re.search(r"/(?:e|embed)/([^/]+?)(?:\.html)?/?(?:[?#].*)?$", url)
    return m.group(1) if m else None


async def _resolve_rubystm(file_code: str, page_url: str) -> str | None:
    """POST to rubystm /dl, unpack the JWPlayer config, return the master URL."""
    data = {
        "op": "embed",
        "file_code": file_code,
        "auto": "1",
        "referer": TOONSTREAM_BASE + "/",
    }
    headers = {
        "User-Agent": _UA,
        "Referer": page_url,
        "Origin": RUBYSTM_BASE,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    try:
        resp = await _post(f"{RUBYSTM_BASE}/dl", data=data, headers=headers)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.warning("rubystm /dl failed for %s: %s", file_code, e)
        return None

    m = _PACKER_RE.search(html)
    if m:
        try:
            payload, base_s, count_s, words_s = m.groups()
            decoded = _unpack(payload, int(base_s), int(count_s), words_s.split("|"))
            url = _extract_file_url(decoded)
            if url:
                return url
        except Exception as e:
            logger.warning("rubystm packer decode failed for %s: %s", file_code, e)

    # Fallback: plain m3u8 anywhere in the response
    return _extract_m3u8(html)


async def _resolve_embed(embed_path: str) -> str | None:
    """
    Resolve a ToonStream /embed/{hex} path to a direct HLS master URL.
    Follows the embed page -> rubystm iframe -> /dl -> unpack chain.
    """
    embed_url = embed_path if embed_path.startswith("http") else f"{TOONSTREAM_BASE}{embed_path}"
    try:
        resp = await _get(embed_url, headers={"Referer": TOONSTREAM_BASE + "/"})
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.warning("ToonStream embed page failed for %s: %s", embed_path, e)
        return None

    # Some embeds are direct file URLs inside the page already.
    direct = _extract_m3u8(html)
    if direct:
        return direct

    m = re.search(r'<iframe\b[^>]*src="(https?://[^"]+)"', html, re.IGNORECASE)
    if not m:
        return None
    video_url = m.group(1)

    file_code = _file_code_from_url(video_url)
    if file_code and ("rubystm.com" in video_url or "streamruby.com" in video_url):
        return await _resolve_rubystm(file_code, video_url)

    # Unknown host: try a shallow m3u8 extraction from its page.
    try:
        resp2 = await _get(video_url, headers={"Referer": embed_url})
        resp2.raise_for_status()
        return _extract_m3u8(resp2.text)
    except Exception:
        return None


@cached("hindi:stream", ttl=1800)
async def get_stream(anilist_id: int, episode: int) -> dict[str, Any]:
    """
    Get a Hindi-dubbed HLS stream for an episode via ToonStream.
    Returns {stream_url, stream_type, referer, source, title, season, ep} or {}.
    """
    try:
        anilist_data = await anilist_client.get_anime_detail(anilist_id)
        media = anilist_data.get("Media") or anilist_data.get("data", {}).get("Media") or {}
        titles = media.get("title", {}) or {}
        title = titles.get("english") or titles.get("romaji") or ""
    except Exception as e:
        logger.warning("ToonStream: AniList resolve failed for %d: %s", anilist_id, e)
        title = ""

    if not title:
        return {}

    slug = await search_series(title)
    if not slug:
        logger.info("ToonStream: no series match for %r (al:%d)", title, anilist_id)
        return {}

    mapped = await map_episode(slug, episode)
    if not mapped:
        return {}
    season, ep = mapped

    embeds = await get_episode_embeds(slug, season, ep)
    if not embeds:
        return {}

    for embed_path in embeds:
        try:
            stream_url = await _resolve_embed(embed_path)
            if stream_url:
                logger.info(
                    "ToonStream: al:%d %r -> %r s%d ep%d -> %.100s",
                    anilist_id, title, slug, season, ep, stream_url,
                )
                return {
                    "source": "toonstream",
                    "stream_url": stream_url,
                    "stream_type": "hls",
                    "referer": RUBYSTM_BASE + "/",
                    "title": title,
                    "season": season,
                    "ep": ep,
                    "langs": list(_SUPPORTED_LANGS),
                }
        except Exception as e:
            logger.warning("ToonStream embed %s failed: %s", embed_path, e)
            continue

    logger.info("ToonStream: no working stream for al:%d %r ep%d", anilist_id, title, episode)
    return {}


async def close():
    global _client
    _client = None
