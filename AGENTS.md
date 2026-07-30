---

## Goal

Maintain and fix bugs in the Anibinge anime discovery/tracking platform (Next.js 15 + FastAPI + PostgreSQL + Redis) deployed on Vercel (frontend) and Render (backend).

## Instructions

- **Tech Stack**: Next.js 15 (App Router, React 19, Tailwind CSS v4, shadcn/ui) + FastAPI + PostgreSQL + Redis
- **Deployed**: Vercel (frontend, auto-deploy on push to main) + Render (backend, auto-deploy on push to main)
- **Git remote**: `https://github.com/evinvk/anibinge.git` — local path: `C:\Users\rs987\Documents\Default Project\anibinge`
- **Git user**: `evinvk` / `evinvk18@gmail.com`
- **Frontend env (`.env` in frontend/)**: `NEXT_PUBLIC_API_URL=http://localhost:8000` (local dev); production uses Vercel env vars
- **Backend env**: Render env vars; `ALLOWED_ORIGINS=https://anibinge.fun,https://www.anibinge.fun`
- **Push workflow**: `git pull origin main --rebase; git push origin main` — NEVER force push
- **PowerShell**: Use `;` not `&&` as command separator
- **Domain**: `anibinge.fun` (custom domain on Vercel), `https://anibinge-backend-k6td.onrender.com` (backend)

### API Routes
- `/api/v1/` — Main v1 router (mounted at root)
- `/api/v1/streaming/` — Streaming, search, episodes, resolve, anime info, GogoAnime, Anivexa
- `/api/v1/catalog/` — Catalog + search
- `/api/v1/anime/` — Seasonal anime
- `/api/v1/watchlist/` — Watchlist CRUD
- `/api/v1/user/` — User profiles
- `/api/v1/progress/` — Episode progress tracking

### Key Patterns
- Backend uses `@functools.lru_cache(maxsize=1)` for per-endpoint caching with `TTLCache` invalidation via `/cache/invalidate` endpoint
- Frontend `api.ts` handles URL construction, JSON parsing, and error handling; all paths are `/api/v1/...`
- Frontend `api.cache.invalidate()` calls backend to bust server-side caches
- Jikan API blocked/504 from Render — use AniList GraphQL instead
- GogoAnime search is broken — client does local fuzzy match on full catalog
- GogoAnime catalog sorted by last update time (upload order proxy)
- Render free tier: cold starts 30-60s, instances spin down when idle

## Discoveries

### GogoAnime Streaming (Working as of latest session)
- **`/api/v1/streaming/gogoanime/stream/{slug}/{episode}`** — Returns JSON with `url`, `referer`, `headers`, `type: "hls"` (or `mp4`)
- `gogoanime_client.get_episode()` returns `serverInfo.qualities` (SUB/DUB server groups) and `defaultStreamingUrl`
- **Server resolution**: `gogoanime_client.resolve_server_url(serverId)` calls `/streaming.php?id=...` and extracts m3u8 URL from JSON response — **works reliably**
- **Fallback chain**: Try `serverInfo` quality servers first (exclude `anivexa:*` serverIds), then `defaultStreamingUrl` as last resort
- Both m3u8 (proxy via `/stream` endpoint) and MP4 (direct proxy) paths work for anime like Boku no Hero Academia (slug: `boku-no-hero-academia-4th-season`)

### GogoAnime Download Endpoint (FIXED — needs testing)
- **`/api/v1/streaming/download`** — Now uses same fallback chain as watch player
- **Problem it had**: Only tried `defaultStreamingUrl` for GogoAnime (incomplete), and Anivexa fallback required `anilist_id` (often not set)
- **Fix applied**: Now tries `serverInfo` quality servers → `defaultStreamingUrl` → title-based AniList resolve → Anivexa stream
- **Status**: Just pushed fix, user testing, got `"Download failed"` error — **needs debugging**

### Download Button Issue (UNDER INVESTIGATION)
- **Error**: `{"detail":"Download failed"}` — This is the generic catch-all at streaming.py:1388
- **Possible causes**:
  1. Stream resolves fine but segment download exceeds Render timeout
  2. m3u8 CDN requires specific referer/cookies not being sent
  3. `gogoanime_client.resolve_server_url()` returns URL that works for streaming (proxy) but not for direct download
- **Next step**: Add verbose logging (just pushed), test with a specific anime to identify exact failure point
- **Note**: The watch player works via proxy (`/api/v1/streaming/gogoanime/stream/{slug}/{ep}`) which handles CORS/referer internally — download endpoint does direct fetch which may need different handling

### `/recent` — Latest Releases (Frontend Next.js Route, NOT Backend)
- **IMPORTANT**: The `/api/v1/streaming/recent` endpoint is a **Next.js API route** at `frontend/app/api/v1/streaming/recent/route.ts`, NOT a backend endpoint
- **PROBLEM**: Was querying AniList GraphQL for `RELEASING` anime sorted by `POPULARITY_DESC`, computing "recent" from `nextAiringEpisode - 7 days`. This showed schedule estimates, not real uploads. `slug` was always `null`, so cards linked to `/anime/${anilist_id}` (info page) instead of `/watch/${slug}?ep=${ep}` (watch page).
- **FIX**: Rewrote to fetch `fetchGogoApi("/api/home")` → `latest_episodes` as primary source. Each item has real `slug` (GogoAnime `id`) and `episode`. Falls back to AniList if GogoAnime is unreachable. Enriches with AniList metadata in one batch GraphQL query.
- **Key discovery**: GogoAnime's `/api/home` endpoint is already consumed by `frontend/app/api/v1/streaming/gogoanime/_gogoanime.ts` which tries direct fetch first, then falls back to Cloudflare Worker proxy (`CF_PROXY_URL`)

### GogoAnime /api/home data shape
- Response: `{ latest_episodes: [{ id: "slug", title: "string", image: "url", episode: number }] }`
- On the homepage, each card links to `/watch/${slug}?ep=${episode}` — this now works because `slug` is populated

### Domain DNS (Fixed)
- `anibinge.fun` was broken because Hostinger had wrong Cloudflare nameservers
- Fix: Set Hostinger nameservers to `n.sarah.ns.cloudflare.com` / `n.smith.ns.cloudflare.com`, added A records to `76.76.21.21` (Vercel IP) in Cloudflare DNS, orange cloud enabled
- Backend (Render) was suspended — user confirmed moved to Vercel; `/api/v1/...` endpoints likely served through Next.js API routes

### Favicon (Created & Deployed)
- Purple gradient "A" branding: `favicon.svg`, `favicon.ico` (693 B), `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`
- `?v=4` cache bust added to `layout.tsx`
- Google Search still shows old Vercel globe — Google has its own favicon cache (updates on its own schedule, typically weeks)

### Seasonal Data
- `/api/v1/anime/schedule` was fetching **ALL** AniList anime (~50k) due to `status: null` bug. Fixed with `status: ["RELEASING", "NOT_YET_RELEASED"]`.

### Anime Detail Page Bugs (Deferred)
- Synopsis renders raw HTML tags (needs `dangerouslySetInnerHTML` or sanitizer)
- Empty banner (no `bannerImage` in response for this anime)
- `members` and `ratings` fields missing (need AniList stats)
- Default character images shown (no image optimization)

## Accomplished

### Completed (All Pushed to Main)
- **Mobile hero banner**, **browser push notifications**, **`isLarge` reference fix**, **OG image**, **browse filters fix**, **admin role protection**, **home page simplified**, **GogoAnime dub support**, **video subtitles fullscreen**, **mobile menu auto-close**, **Schedule UI**, **News API**
- **Seasonal page — MAL client fix**, **AnimeSchedule as primary source**, **caching fix**, **year range**
- **Seasonal images fixes**, **News fix**, **CORS fix**, **DateTime timezone mismatch fix**, **Watchlist save fix**, **Favicon fix**
- **Footer**: "About" branding, copyright simplified
- **Custom domain**: `anibinge.fun` — all code references updated, sitemap submitted
- **Download button in `GogoanimeWatchPlayer`**: Moved next to Sub/Dub toggle, always visible
- **Download button in `StreamingPlayer`**: Moved next to Sub/Dub toggle, always visible
- **Download button on anime detail page** (`/anime/[id]`): Shows "Download Season (N eps)" with progress indicator
- **`api.anivexaResolve`** added to `frontend/lib/api.ts`
- **`DownloadButton` component** (`frontend/components/download-button.tsx`)
- **Latest Releases rewrite**: Backend `/recent` endpoint uses 3-page AniList schedule + GogoAnime cross-ref
- **`get_airing_schedule`** added to `anilist_client.py`
- **Latest releases timestamp display**: `timeAgo()` function in `latest-releases-row.tsx`
- **Domain DNS fix**: Cloudflare nameservers corrected, A records to Vercel IP
- **Favicon created/deployed**: Purple "A" branding, `?v=4` cache bust
- **`/recent` API route rewrite**: Frontend Next.js route now sources GogoAnime `/api/home` for real upload data with proper slugs

### In Progress — NOT CRITICAL
- **Download endpoint fix**: Rewrote `/api/v1/streaming/download` to use full fallback chain (GogoAnime serverInfo → defaultStreamingUrl → AniList title resolve → Anivexa). Pushed but getting `"Download failed"` error. **Needs investigation/testing.**

### Blocked
- Jikan API unreliable from Render IPs
- Image serving via `/api/proxy` — need to verify it handles anime posters correctly

## Relevant files / directories

### Backend (FastAPI) — `anibinge/backend/`
- **`app/routers/streaming.py`** — **ACTIVE FILE** — Contains `/download` endpoint (just fixed, needs debugging), `/gogoanime/stream/{slug}/{ep}`, `/anivexa/resolve`, `/schedule`, all streaming endpoints. `_dub_slug()` helper. Error detail at line 1388 changed to include exception info.
- `app/services/anilist_client.py` — `get_schedule()` (paginated, `nextAiringEpisode`), `get_airing_schedule()`, `search_anime()`, `get_seasonal()`
- `app/services/gogoanime_client.py` — `get_catalog()`, `get_episode()` (returns `serverInfo` + `defaultStreamingUrl`), `resolve_server_url()` (resolves m3u8 from streaming.php), `search_anime()`
- `app/services/anivexa_client.py` — `get_stream_with_fallback()` returns `stream_url`, `stream_type` (mp4/hls), `referer`

### Frontend (Next.js) — `anibinge/frontend/`
- **`frontend/app/api/v1/streaming/recent/route.ts`** — **REWRITTEN** — Now fetches GogoAnime `/api/home` for real uploads, with AniList enrichment + fallback
- **`frontend/app/api/v1/streaming/gogoanime/_gogoanime.ts`** — `fetchGogoApi()`: direct fetch → CF proxy fallback, exports `GOGO_BASE` = `https://gogoanimehd.to`
- **`frontend/app/api/v1/streaming/gogoanime/latest/route.ts`** — Separate endpoint for GogoAnime ongoing catalog
- **`frontend/app/api/proxy/route.ts`** — Image/stream proxy (Edge runtime, ad filtering for m3u8)
- **`frontend/lib/cf-proxy.ts`** — `fetchViaCfProxy()` uses `CF_PROXY_URL` env var for Cloudflare Worker proxy
- **`frontend/components/gogoanime-watch-player.tsx`** — **ACTIVE FILE** — Watch player with download button (lines 532-548), uses `api.downloadUrl()` with `slug`, `anilist_id`, `ep`, `audio`, `filename`
- `frontend/components/download-button.tsx` — Download button on anime detail page
- **`frontend/components/latest-releases-row.tsx`** — EpisodeCard with `timeAgo()` display; card links to `/watch/${slug}?ep=${episode}` if slug present, else `/anime/${anilist_id}`
- `frontend/components/latest-releases-section.tsx` — Client component, fetches recent episodes
- `frontend/app/anime/[id]/page.tsx` — Uses `DownloadButton`
- `frontend/app/watch/[slug]/page.tsx` — Passes props to `GogoAnimeWatchPlayer`
- `frontend/app/recent/page.tsx` — Dedicated `/recent` page with paginated episodes
- **`frontend/lib/api.ts`** — **ACTIVE FILE** — `api.downloadUrl()`, `api.gogosearch()`, `api.anivexaResolve()`, `api.recentEpisodes()`
- **`frontend/app/layout.tsx`** — Favicon cache bust (`?v=4`)
- **`frontend/public/favicon.svg`**, `favicon.ico`, `apple-touch-icon.png`, `icons/icon-192.png`, `icons/icon-512.png` — Branded purple "A" favicons
