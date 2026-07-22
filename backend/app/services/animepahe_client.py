"""
AnimePahe scraper client — searches, fetches episodes, and resolves streaming links.
Uses tls_client for Cloudflare bypass and Node.js for Kwik URL resolution.
"""
import asyncio
import logging
import random
import re
import subprocess
import tempfile
import os
import time
from typing import Any

import tls_client
import execjs
from bs4 import BeautifulSoup

logger = logging.getLogger("anibinge.animepahe")

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
]

_BASE_URL = "https://animepahe.com"
_COOKIE_REFRESH_INTERVAL = 1800  # 30 min


class AnimePaheClient:
    def __init__(self):
        self._session: tls_client.Session | None = None
        self._last_refresh: float = 0
        self._lock = asyncio.Lock()

    def _get_session(self) -> tls_client.Session:
        if self._session is None:
            self._session = tls_client.Session(client_identifier="chrome_120")
            self._last_refresh = time.time()
        return self._session

    async def _refresh_cookies(self):
        async with self._lock:
            now = time.time()
            if now - self._last_refresh < _COOKIE_REFRESH_INTERVAL:
                return
            self._session = None
            self._get_session()
            self._last_refresh = now
            logger.info("AnimePahe session refreshed")

    async def _get(self, url: str) -> Any:
        await self._refresh_cookies()
        session = self._get_session()
        headers = {
            "User-Agent": random.choice(_USER_AGENTS),
            "Referer": f"{_BASE_URL}/",
            "Accept": "application/json, text/html, */*",
        }

        def _do():
            return session.get(url, headers=headers)

        return await asyncio.to_thread(_do)

    async def search_anime(self, query: str) -> list[dict]:
        url = f"{_BASE_URL}/api?m=search&q={query}"
        try:
            resp = await self._get(url)
            if resp.status_code == 403:
                logger.warning("AnimePahe search got 403 for '%s' — Cloudflare block", query)
                return []
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.warning("AnimePahe search failed for '%s': %s", query, e)
            return []

        results = []
        for item in data.get("data", []):
            results.append({
                "id": item.get("id"),
                "title": item.get("title"),
                "poster": item.get("poster"),
                "year": item.get("year"),
                "type": item.get("type"),
                "session": item.get("session"),
                "episodes": item.get("episodes"),
                "score": item.get("score"),
                "status": item.get("status"),
            })
        logger.info("AnimePahe search '%s': %d results", query, len(results))
        return results

    async def get_episodes(self, anime_session: str) -> list[dict]:
        try:
            html_resp = await self._get(f"{_BASE_URL}/anime/{anime_session}")
            html_resp.raise_for_status()
            soup = BeautifulSoup(html_resp.text, "html.parser")

            meta = soup.find("meta", {"property": "og:url"})
            if not meta:
                logger.warning("AnimePahe: no og:url meta found for session %s", anime_session)
                return []
            temp_id = meta["content"].rstrip("/").split("/")[-1]

            first_page_resp = await self._get(
                f"{_BASE_URL}/api?m=release&id={temp_id}&sort=episode_asc&page=1"
            )
            first_page_resp.raise_for_status()
            first_page_data = first_page_resp.json()
            episodes = first_page_data.get("data", [])
            last_page = first_page_data.get("last_page", 1)

            if last_page > 1:
                async def _fetch_page(p):
                    r = await self._get(
                        f"{_BASE_URL}/api?m=release&id={temp_id}&sort=episode_asc&page={p}"
                    )
                    r.raise_for_status()
                    return r.json().get("data", [])

                remaining = await asyncio.gather(*[_fetch_page(p) for p in range(2, last_page + 1)])
                for page_data in remaining:
                    episodes.extend(page_data)

        except Exception as e:
            logger.warning("AnimePahe episodes failed for session %s: %s", anime_session, e)
            return []

        return [
            {
                "id": e.get("id"),
                "number": e.get("episode"),
                "title": e.get("title") or f"Episode {e.get('episode')}",
                "snapshot": e.get("snapshot"),
                "session": e.get("session"),
            }
            for e in episodes
        ]

    async def get_sources(self, anime_session: str, episode_session: str) -> list[dict]:
        try:
            resp = await self._get(f"{_BASE_URL}/play/{anime_session}/{episode_session}")
            resp.raise_for_status()
            html = resp.text
        except Exception as e:
            logger.warning("AnimePahe sources failed: %s", e)
            return []

        buttons = re.findall(
            r'<button[^>]+data-src="([^"]+)"[^>]+data-fansub="([^"]+)"'
            r'[^>]+data-resolution="([^"]+)"[^>]+data-audio="([^"]+)"[^>]*>',
            html,
        )

        sources = []
        for src, fansub, resolution, audio in buttons:
            if "kwik." in src:
                sources.append({
                    "url": src.strip(),
                    "quality": f"{resolution.strip()}p",
                    "fansub": fansub.strip(),
                    "audio": audio.strip(),
                })

        if not sources:
            kwik_links = re.findall(r"https://kwik\.[a-z]+/e/\w+", html)
            sources = [
                {"url": link, "quality": None, "fansub": None, "audio": None}
                for link in kwik_links
            ]

        seen = set()
        unique = []
        for s in sources:
            if s["url"] not in seen:
                seen.add(s["url"])
                unique.append(s)

        def sort_key(s):
            try:
                return int(s["quality"].replace("p", "")) if s["quality"] else 0
            except (ValueError, AttributeError):
                return 0

        unique.sort(key=sort_key, reverse=True)
        return unique

    async def resolve_m3u8(self, kwik_url: str) -> str | None:
        try:
            resp = await self._get(kwik_url)
            html = resp.text
        except Exception as e:
            logger.warning("AnimePahe m3u8 resolve fetch failed for %s: %s", kwik_url, e)
            return None

        direct = re.search(r"https?://[^'\"\s<>]+\.m3u8[^'\"\s<>]*", html)
        if direct:
            return direct.group(0)

        scripts = re.findall(r"(<script[^>]*>[\s\S]*?</script>)", html, re.IGNORECASE)
        script_block = None
        largest_len = 0
        for s in scripts:
            if "eval(" in s:
                if any(k in s for k in ("Plyr", ".m3u8", "source", "uwu")):
                    script_block = s
                    break
                if len(s) > largest_len:
                    largest_len = len(s)
                    script_block = s

        if not script_block:
            logger.warning("AnimePahe: no eval script found for %s", kwik_url)
            return None

        inner_js = re.sub(r"^<script[^>]*>", "", script_block, flags=re.IGNORECASE).strip()
        inner_js = re.sub(r"</script>$", "", inner_js, flags=re.IGNORECASE).strip()

        wrapper = r"""
globalThis.window = { location: {} };
globalThis.document = { cookie: '' };
globalThis.navigator = { userAgent: 'Mozilla/5.0' };
const __captured = [];
const origLog = console.log;
console.log = (...args) => { __captured.push(args.join(' ')); origLog(...args); };
(function(){
  const origEval = eval;
  eval = (x) => { __captured.push('[EVAL]' + x); return origEval(x); };
})();
"""
        full_js = wrapper + "\n" + inner_js + "\n" + (
            "setTimeout(()=>{for(const c of __captured){"
            "console.log(c);}process.exit(0)},500);"
        )

        try:
            result = await asyncio.to_thread(self._run_js, full_js)
        except Exception as e:
            logger.warning("AnimePahe JS exec failed for %s: %s", kwik_url, e)
            return None

        m = re.search(r"https?://[^'\"\s]+\.m3u8[^\s'\"\)]*", result)
        if m:
            return m.group(0)

        logger.warning("AnimePahe: no m3u8 found in JS output for %s", kwik_url)
        return None

    @staticmethod
    def _run_js(code: str) -> str:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tf:
            tf.write(code)
            tf.flush()
            tmp_path = tf.name
        try:
            proc = subprocess.run(
                ["node", tmp_path],
                capture_output=True, text=True, timeout=10,
            )
            return proc.stdout + proc.stderr
        except Exception:
            return ""
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


_client: AnimePaheClient | None = None


def get_client() -> AnimePaheClient:
    global _client
    if _client is None:
        _client = AnimePaheClient()
    return _client
