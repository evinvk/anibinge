"""
AnimeXin scraping client — scrapes animexin.dev (WordPress) for donghua content.
Provides trending, latest, search, anime details, and streaming server resolution.
"""
import asyncio
import base64
import json
import logging
import re
import time
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.animexin")

_BASE_URL = "https://animexin.dev"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": _BASE_URL + "/",
}

_POPULAR_CACHE: dict[str, tuple[float, list[dict]]] = {}
_POPULAR_TTL = 300  # 5 min
_LATEST_CACHE: dict[str, tuple[float, list[dict]]] = {}
_LATEST_TTL = 300
_SEARCH_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_TTL = 300
_DETAIL_CACHE: dict[str, tuple[float, dict | None]] = {}
_DETAIL_TTL = 600  # 10 min
_SERVERS_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SERVERS_TTL = 300
_BROWSE_CACHE: dict[str, tuple[float, list[dict]]] = {}
_BROWSE_TTL = 300


def _abs(url: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return _BASE_URL + url
    return url


def _parse_card(card_tag) -> dict | None:
    """Parse a single .bs .bsx card into a normalized dict."""
    try:
        link = card_tag.find("a")
        if not link:
            return None

        href = link.get("href", "")

        title = ""
        title_el = link.find("div", class_="tt")
        if title_el:
            # Extract direct text nodes from .tt (clean title, not the h2)
            for child in title_el.children:
                if isinstance(child, str):
                    t = child.strip()
                    if t:
                        title = t
                        break
            if not title:
                h2 = title_el.find("h2")
                if h2:
                    # Strip trailing episode/sub info from h2
                    title = h2.get_text(strip=True)
        if not title:
            title = link.get("title", "")

        img = link.find("img")
        poster = img.get("src", "") if img else ""

        ep_badge = link.find("span", class_="epx")
        episode = None
        if ep_badge:
            ep_text = ep_badge.get_text(strip=True)
            m = re.search(r"(\d+)", ep_text)
            if m:
                episode = int(m.group(1))

        sub_badge = link.find("span", class_="sb")
        sub_type = sub_badge.get_text(strip=True) if sub_badge else "Sub"

        type_badge = link.find("div", class_="typez")
        media_type = type_badge.get_text(strip=True) if type_badge else "ONA"

        slug = href.rstrip("/").split("/")[-1] if href else ""
        slug = re.sub(r"-episode-\d+.*$", "", slug)
        slug = re.sub(r"-(?:indonesia|english|subtitle).*$", "", slug, flags=re.IGNORECASE)

        return {
            "slug": slug,
            "title": title,
            "poster": _abs(poster) if poster else None,
            "episode": episode,
            "sub_type": sub_type,
            "type": media_type,
            "url": href,
        }
    except Exception as e:
        logger.debug("Failed to parse card: %s", e)
        return None


async def _fetch_page(path: str = "/", params: dict | None = None) -> str:
    client = get_shared_client(timeout=_TIMEOUT, headers=_HEADERS)
    url = _BASE_URL + path
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    return resp.text


def _parse_homepage(html: str) -> tuple[list[dict], list[dict]]:
    """Parse the AnimeXin homepage, return (popular, latest)."""
    soup = BeautifulSoup(html, "lxml")

    popular = []
    popular_section = soup.find("div", class_="popularslider")
    if popular_section:
        for card in popular_section.find_all("article", class_="bs"):
            item = _parse_card(card)
            if item and item.get("title"):
                popular.append(item)

    latest = []
    latest_section = soup.find("div", class_="listupd")
    if latest_section:
        for card in latest_section.find_all("article", class_="bs"):
            item = _parse_card(card)
            if item and item.get("title"):
                latest.append(item)

    return popular, latest


def _parse_search_results(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    results = []
    container = soup.find("div", class_="listupd")
    if not container:
        container = soup
    for card in container.find_all("article", class_="bs"):
        item = _parse_card(card)
        if item and item.get("title"):
            results.append(item)
    return results


def _parse_anime_detail(html: str, slug: str) -> dict | None:
    soup = BeautifulSoup(html, "lxml")

    # Series page uses .bigcontent or .postbody, episode page uses .single-info
    # Try series page structure first
    bigcontent = soup.find("div", class_="bigcontent")
    infox = soup.find("div", class_="infox")

    if not bigcontent and not infox:
        # Fallback: try episode-page structure
        info_box = soup.find("div", class_="single-info")
        if info_box:
            return _parse_episode_as_detail(info_box, slug)
        return None

    # Title
    title = slug
    if infox:
        h1 = infox.find("h1")
        if h1:
            title = h1.get_text(strip=True)
    if title == slug:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)

    # Poster
    poster = None
    thumb = soup.find("div", class_="thumb")
    if thumb:
        img = thumb.find("img")
        if img:
            poster = _abs(img.get("src", ""))
    if not poster and bigcontent:
        img = bigcontent.find("img")
        if img:
            poster = _abs(img.get("src", ""))

    # Rating
    score = None
    rating_el = soup.find("div", class_="rating")
    if rating_el:
        strong = rating_el.find("strong")
        if strong:
            m = re.search(r"([\d.]+)", strong.get_text())
            if m:
                score = float(m.group(1))

    # Metadata from .spe
    metadata = {}
    spe = soup.find("div", class_="spe")
    if spe:
        for span in spe.find_all("span"):
            text = span.get_text(strip=True)
            if ":" in text:
                key, _, val = text.partition(":")
                metadata[key.strip().lower()] = val.strip()

    # Genres
    genres = []
    genxed = soup.find("div", class_="genxed")
    if genxed:
        for a in genxed.find_all("a"):
            genres.append(a.get_text(strip=True))

    # Description
    description = ""
    desc_el = soup.find("div", class_="desc")
    if desc_el:
        for colap in desc_el.find_all("span", class_="colap"):
            colap.decompose()
        for b_tag in desc_el.find_all("b"):
            b_tag.decompose()
        description = desc_el.get_text(strip=True)
        # Clean up generic AnimeXin filler text
        if description.startswith("Watch streaming"):
            m = re.match(r"Watch streaming\s+.*?on AnimeXin\.\s*(.*)", description, re.IGNORECASE)
            if m:
                description = m.group(1).strip()
            else:
                description = ""
    if not description and infox:
        ninfo = infox.find("div", class_="ninfo")
        if ninfo:
            description = ninfo.get_text(strip=True)

    # Episode count from metadata
    episodes = None
    if "episodes" in metadata:
        m = re.search(r"(\d+)", metadata["episodes"])
        if m:
            episodes = int(m.group(1))

    # Episode list from .eplister
    episode_list = []
    ep_list_div = soup.find("div", class_="eplister")
    if not ep_list_div:
        ep_list_div = soup.find("div", id="episodeLists")
    if ep_list_div:
        for ep_link in ep_list_div.find_all("a", href=True):
            ep_href = ep_link.get("href", "")
            ep_num = None

            # Try <div class="epl-num"> first
            epl_num_el = ep_link.find("div", class_="epl-num")
            if epl_num_el:
                m = re.search(r"(\d+)", epl_num_el.get_text())
                if m:
                    ep_num = int(m.group(1))

            # Fallback: extract from URL
            if ep_num is None:
                m = re.search(r"episode-(\d+)", ep_href, re.IGNORECASE)
                if m:
                    ep_num = int(m.group(1))

            if ep_num:
                ep_title_el = ep_link.find("div", class_="epl-title")
                ep_title = ep_title_el.get_text(strip=True) if ep_title_el else f"Episode {ep_num}"
                ep_date_el = ep_link.find("div", class_="epl-date")
                ep_date = ep_date_el.get_text(strip=True) if ep_date_el else None
                episode_list.append({
                    "number": ep_num,
                    "title": ep_title,
                    "url": ep_href,
                    "slug": ep_href.rstrip("/").split("/")[-1] if ep_href else "",
                    "date": ep_date,
                })

    # Episodes are listed newest-first on the page; reverse to chronological order
    episode_list.sort(key=lambda x: x["number"])

    status = metadata.get("status", "Ongoing")
    episodes_total = episodes or len(episode_list) or None

    return {
        "slug": slug,
        "title": title,
        "title_alt": None,
        "poster": poster,
        "score": score,
        "status": status,
        "genres": genres,
        "description": description,
        "episodes": episodes_total,
        "type": metadata.get("type", "ONA"),
        "country": metadata.get("country", "China"),
        "released": metadata.get("released", None),
        "duration": metadata.get("duration", None),
        "episode_list": episode_list,
        "url": f"{_BASE_URL}/{slug}/",
    }


def _parse_episode_as_detail(info_box, slug):
    """Parse episode page's single-info as anime detail (fallback)."""
    title_el = info_box.find("h2", itemprop="partOfSeries") or info_box.find("h2")
    title = title_el.get_text(strip=True) if title_el else slug

    alter_el = info_box.find("span", class_="alter")
    title_alt = alter_el.get_text(strip=True) if alter_el else None

    img_el = info_box.find("img", class_="ts-post-image")
    poster = _abs(img_el.get("src", "")) if img_el else None

    score = None
    rating_el = info_box.find("div", class_="rating")
    if rating_el:
        strong = rating_el.find("strong")
        if strong:
            m = re.search(r"([\d.]+)", strong.get_text())
            if m:
                score = float(m.group(1))

    metadata = {}
    spe = info_box.find("div", class_="spe")
    if spe:
        for span in spe.find_all("span"):
            text = span.get_text(strip=True)
            if ":" in text:
                key, _, val = text.partition(":")
                metadata[key.strip().lower()] = val.strip()

    genres = []
    genxed = info_box.find("div", class_="genxed")
    if genxed:
        for a in genxed.find_all("a"):
            genres.append(a.get_text(strip=True))

    desc_el = info_box.find("div", class_="desc")
    description = ""
    if desc_el:
        for colap in desc_el.find_all("span", class_="colap"):
            colap.decompose()
        description = desc_el.get_text(strip=True)

    episodes = None
    if "episodes" in metadata:
        m = re.search(r"(\d+)", metadata["episodes"])
        if m:
            episodes = int(m.group(1))

    return {
        "slug": slug,
        "title": title,
        "title_alt": title_alt,
        "poster": poster,
        "score": score,
        "status": metadata.get("status", "Ongoing"),
        "genres": genres,
        "description": description,
        "episodes": episodes,
        "type": metadata.get("type", "ONA"),
        "country": metadata.get("country", "China"),
        "released": metadata.get("released", None),
        "duration": metadata.get("duration", None),
        "episode_list": [],
        "url": f"{_BASE_URL}/{slug}/",
    }


def _decode_server_value(value: str) -> str:
    """Decode base64 server option value to HTML."""
    try:
        padding = 4 - len(value) % 4
        if padding != 4:
            value += "=" * padding
        value = value.replace("-", "+").replace("_", "/")
        return base64.b64decode(value).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_stream_url_from_html(html: str) -> str | None:
    """Extract video source URL from decoded server HTML."""
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")
    iframe = soup.find("iframe")
    if iframe:
        src = iframe.get("src", "")
        if src:
            return src
    video = soup.find("video")
    if video:
        source = video.find("source")
        if source:
            return source.get("src", "")
        return video.get("src", "")
    div_style = soup.find("div", style=True)
    if div_style:
        m = re.search(r"url\(['\"]?(.*?)['\"]?\)", div_style.get("style", ""))
        if m:
            return m.group(1)
    return None


def _parse_episode_page(html: str) -> dict:
    """Parse an episode page for servers, metadata, and navigation."""
    soup = BeautifulSoup(html, "lxml")

    servers = []
    select = soup.find("select", class_="mirror")
    if select:
        for option in select.find_all("option"):
            value = option.get("value", "")
            label = option.get_text(strip=True)
            if not value or not label:
                continue
            decoded_html = _decode_server_value(value)
            stream_url = _extract_stream_url_from_html(decoded_html)
            if stream_url:
                servers.append({
                    "label": label,
                    "stream_url": stream_url,
                    "raw_html": decoded_html,
                })

    nav = soup.find("div", class_="naveps")
    prev_url = None
    next_url = None
    all_eps_url = None
    if nav:
        prev_link = nav.find("a", rel="prev")
        if prev_link:
            prev_url = prev_link.get("href")
        all_link = nav.find("a", attrs={"aria-label": "All Episodes"}) or nav.find("a", class_="nvsc")
        if all_link:
            all_eps_url = all_link.get("href")
        next_link = nav.find("a", rel="next")
        if next_link:
            next_url = next_link.get("href")

    info_box = soup.find("div", class_="single-info")
    title = ""
    if info_box:
        h2 = info_box.find("h2")
        if h2:
            title = h2.get_text(strip=True)

    return {
        "title": title,
        "servers": servers,
        "prev_url": prev_url,
        "next_url": next_url,
        "all_episodes_url": all_eps_url,
    }


async def get_trending() -> list[dict]:
    """Get popular/trending donghua from AnimeXin homepage."""
    now = time.time()
    cache_key = "home"
    if cache_key in _POPULAR_CACHE:
        cached_at, data = _POPULAR_CACHE[cache_key]
        if now - cached_at < _POPULAR_TTL:
            return data

    try:
        html = await _fetch_page("/")
        popular, _ = _parse_homepage(html)
        _POPULAR_CACHE[cache_key] = (now, popular)
        return popular
    except Exception as e:
        logger.error("Failed to fetch AnimeXin trending: %s", e)
        if cache_key in _POPULAR_CACHE:
            return _POPULAR_CACHE[cache_key][1]
        return []


async def get_latest(page: int = 1) -> list[dict]:
    """Get latest donghua releases from AnimeXin."""
    now = time.time()
    cache_key = f"latest:{page}"
    if cache_key in _LATEST_CACHE:
        cached_at, data = _LATEST_CACHE[cache_key]
        if now - cached_at < _LATEST_TTL:
            return data

    try:
        if page == 1:
            html = await _fetch_page("/")
            _, latest = _parse_homepage(html)
        else:
            html = await _fetch_page(f"/anime/page/{page}/")
            latest = _parse_search_results(html)

        _LATEST_CACHE[cache_key] = (now, latest)
        return latest
    except Exception as e:
        logger.error("Failed to fetch AnimeXin latest (page=%d): %s", page, e)
        if cache_key in _LATEST_CACHE:
            return _LATEST_CACHE[cache_key][1]
        return []


async def search(query: str) -> list[dict]:
    """Search AnimeXin for donghua."""
    now = time.time()
    cache_key = query.lower().strip()
    if cache_key in _SEARCH_CACHE:
        cached_at, data = _SEARCH_CACHE[cache_key]
        if now - cached_at < _SEARCH_TTL:
            return data

    try:
        html = await _fetch_page("/", params={"s": query})
        results = _parse_search_results(html)
        _SEARCH_CACHE[cache_key] = (now, results)
        return results
    except Exception as e:
        logger.error("Failed to search AnimeXin for '%s': %s", query, e)
        if cache_key in _SEARCH_CACHE:
            return _SEARCH_CACHE[cache_key][1]
        return []


async def get_browse(page: int = 1) -> list[dict]:
    """Browse all donghua from AnimeXin listing pages."""
    now = time.time()
    cache_key = f"browse:{page}"
    if cache_key in _BROWSE_CACHE:
        cached_at, data = _BROWSE_CACHE[cache_key]
        if now - cached_at < _BROWSE_TTL:
            return data

    try:
        if page <= 1:
            html = await _fetch_page("/anime/")
        else:
            html = await _fetch_page(f"/anime/page/{page}/")
        items = _parse_search_results(html)
        _BROWSE_CACHE[cache_key] = (now, items)
        return items
    except Exception as e:
        logger.error("Failed to browse AnimeXin (page=%d): %s", page, e)
        if cache_key in _BROWSE_CACHE:
            return _BROWSE_CACHE[cache_key][1]
        return []


async def get_anime_detail(slug: str) -> dict | None:
    """Get anime detail page from AnimeXin."""
    now = time.time()
    if slug in _DETAIL_CACHE:
        cached_at, data = _DETAIL_CACHE[slug]
        if now - cached_at < _DETAIL_TTL:
            return data

    try:
        html = await _fetch_page(f"/{slug}/")
        detail = _parse_anime_detail(html, slug)
        _DETAIL_CACHE[slug] = (now, detail)
        return detail
    except Exception as e:
        logger.error("Failed to fetch AnimeXin detail for '%s': %s", slug, e)
        if slug in _DETAIL_CACHE:
            return _DETAIL_CACHE[slug][1]
        return None


async def get_episode_servers(episode_url: str) -> dict:
    """Get streaming servers for an episode page."""
    now = time.time()
    cache_key = episode_url.rstrip("/")
    if cache_key in _SERVERS_CACHE:
        cached_at, data = _SERVERS_CACHE[cache_key]
        if now - cached_at < _SERVERS_TTL:
            return data

    try:
        if episode_url.startswith("/"):
            episode_url = _BASE_URL + episode_url
        html = await _fetch_page(episode_url.replace(_BASE_URL, ""))
        result = _parse_episode_page(html)
        _SERVERS_CACHE[cache_key] = (now, result)
        return result
    except Exception as e:
        logger.error("Failed to fetch AnimeXin episode servers: %s", e)
        if cache_key in _SERVERS_CACHE:
            return _SERVERS_CACHE[cache_key][1]
        return {"title": "", "servers": [], "prev_url": None, "next_url": None, "all_episodes_url": None}


async def get_stream_for_episode(episode_url: str, server_index: int = 0) -> dict:
    """Get stream URL for a specific episode and server."""
    result = await get_episode_servers(episode_url)
    servers = result.get("servers", [])
    if not servers:
        return {"error": "no_servers", "message": "No streaming servers found"}

    idx = min(server_index, len(servers) - 1)
    server = servers[idx]

    return {
        "stream_url": server["stream_url"],
        "label": server["label"],
        "servers": [{"label": s["label"], "stream_url": s["stream_url"]} for s in servers],
        "title": result.get("title", ""),
    }
