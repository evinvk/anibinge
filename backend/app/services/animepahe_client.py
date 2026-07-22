"""
AnimePahe scraper client — searches, fetches episodes, and resolves streaming links.
Uses Playwright headless browser to bypass Cloudflare Turnstile protection.
"""
import asyncio
import json
import logging
import re
import subprocess
import tempfile
import os
from typing import Any

logger = logging.getLogger("anibinge.animepahe")

_BASE_URL = "https://animepahe.com"


class AnimePaheClient:
    def __init__(self):
        self._playwright = None
        self._browser = None
        self._page = None
        self._lock = asyncio.Lock()
        self._initialized = False

    async def _ensure_browser(self):
        if self._initialized and self._browser and self._browser.is_connected():
            return
        async with self._lock:
            if self._initialized and self._browser and self._browser.is_connected():
                return
            try:
                if self._page:
                    await self._page.close()
                if self._browser:
                    await self._browser.close()
                if self._playwright:
                    await self._playwright.stop()
            except Exception:
                pass
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ],
            )
            context = await self._browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720},
            )
            self._page = await context.new_page()
            self._initialized = True
            logger.info("AnimePahe browser launched")

            try:
                resp = await self._page.goto(_BASE_URL, wait_until="networkidle", timeout=45000)
                logger.info("AnimePahe initial page loaded (status=%s)", resp.status if resp else "None")
            except Exception as e:
                logger.warning("AnimePahe initial load failed: %s", e)

    async def close(self):
        try:
            if self._page:
                await self._page.close()
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        self._page = None
        self._browser = None
        self._playwright = None
        self._initialized = False

    async def _api_get(self, url: str) -> Any:
        await self._ensure_browser()
        try:
            resp = await self._page.goto(url, wait_until="networkidle", timeout=30000)
            if resp and resp.status == 200:
                text = await self._page.evaluate("document.body.innerText")
                return json.loads(text)
            elif resp and resp.status == 403:
                logger.warning("AnimePahe API %s returned 403 (Cloudflare)", url)
                return None
            else:
                logger.warning("AnimePahe API %s returned %s", url, resp.status if resp else "None")
                return None
        except Exception as e:
            logger.warning("AnimePahe API fetch failed for %s: %s", url, e)
            return None

    async def _page_get(self, url: str) -> str | None:
        await self._ensure_browser()
        try:
            resp = await self._page.goto(url, wait_until="networkidle", timeout=30000)
            if resp and resp.status == 200:
                return await self._page.content()
            logger.warning("AnimePahe page %s returned %s", url, resp.status if resp else "None")
            return None
        except Exception as e:
            logger.warning("AnimePahe page load failed for %s: %s", url, e)
            return None

    async def search_anime(self, query: str) -> list[dict]:
        url = f"{_BASE_URL}/api?m=search&q={query}"
        data = await self._api_get(url)
        if not data:
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
        html = await self._page_get(f"{_BASE_URL}/anime/{anime_session}")
        if not html:
            return []

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        meta = soup.find("meta", {"property": "og:url"})
        if not meta:
            logger.warning("AnimePahe: no og:url meta for session %s", anime_session)
            return []
        temp_id = meta["content"].rstrip("/").split("/")[-1]

        first_page_data = await self._api_get(
            f"{_BASE_URL}/api?m=release&id={temp_id}&sort=episode_asc&page=1"
        )
        if not first_page_data:
            return []

        episodes = first_page_data.get("data", [])
        last_page = first_page_data.get("last_page", 1)

        if last_page > 1:
            async def _fetch_page(p):
                return await self._api_get(
                    f"{_BASE_URL}/api?m=release&id={temp_id}&sort=episode_asc&page={p}"
                )

            remaining = await asyncio.gather(*[_fetch_page(p) for p in range(2, last_page + 1)])
            for page_data in remaining:
                if page_data:
                    episodes.extend(page_data.get("data", []))

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
        html = await self._page_get(f"{_BASE_URL}/play/{anime_session}/{episode_session}")
        if not html:
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
        html = await self._page_get(kwik_url)
        if not html:
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
