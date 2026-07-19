# Anibinge

A modern anime discovery & tracking platform — think Anime-Planet's depth crossed with
LiveChart's seasonal/schedule focus, wrapped in its own purple-black glassmorphic identity.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer Motion |
| Backend | FastAPI · Python 3.12 · httpx |
| Database | PostgreSQL (SQLAlchemy async + Alembic migrations) |
| Cache | Redis |
| Data sources | Jikan (MyAnimeList) primary → AniList GraphQL fallback · TMDB & YouTube optional |
| Infra | Docker Compose (local) · Vercel (frontend) · Railway/Render (backend) · Supabase (Postgres) |

## Project structure

```
anibinge/
├── frontend/                  Next.js 15 app
│   ├── app/                   routes (home, browse, anime/[id], seasonal, schedule, watchlist, admin, ...)
│   ├── components/            AnimeCard, Navbar, SearchModal, HeroBanner, etc.
│   ├── lib/                   api.ts (typed backend client), utils.ts
│   ├── public/                manifest.json, icons
│   └── next.config.js         PWA + image optimization + security headers
├── backend/                   FastAPI app
│   ├── app/
│   │   ├── routers/           anime, seasonal, schedule, search, auth, watchlist, admin
│   │   ├── services/          jikan_client, anilist_client, aggregator (fallback logic)
│   │   ├── core/               config, db, cache (Redis), security (JWT)
│   │   └── models/             SQLAlchemy models
│   ├── alembic/                DB migrations
│   └── requirements.txt
├── docker-compose.yml          postgres + redis + backend + frontend
└── README.md
```

## What's implemented vs. stubbed

**Fully wired:** anime browsing/search/detail via Jikan with AniList fallback, Redis
caching on every upstream call, seasonal & weekly schedule pages, JWT + Google auth
endpoints, watchlist API shape, admin cache-invalidation endpoint, SEO (sitemap, robots,
JSON-LD, OpenGraph), PWA manifest, instant search with voice input.

**Scaffolded with clear `TODO`s** (shape is correct, needs your business logic /
credentials): watchlist persistence (swap the `TODO` comments in
`backend/app/routers/watchlist.py` for real SQLAlchemy queries), news feed (pick a
source — RSS aggregation, an editorial table, or a licensed API — and implement
`GET /api/v1/news`), admin analytics aggregation, AI recommendations (currently
popularity-sorted; swap in a real ranking model once you have watch-history data).

## Local development

### 1. Environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in `JWT_SECRET`, and optionally `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`TMDB_API_KEY`, `YOUTUBE_API_KEY`. Jikan and AniList need no API key.

### 2. Run everything with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend docs (Swagger): http://localhost:8000/api/docs
- Postgres: localhost:5432 · Redis: localhost:6379

### 3. Run without Docker (faster iteration)

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
# start postgres + redis locally or point DATABASE_URL/REDIS_URL at hosted instances
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

### 4. Database migrations

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Performance notes

- Every Jikan/AniList call is Redis-cached (5 min for volatile data like schedules,
  1 hr for details/seasonal, 24 hr for static lists like genres) — repeat requests
  are served from cache, not re-fetched from the upstream API.
- Home page uses React Suspense per-carousel so above-the-fold content (hero) paints
  immediately while lower rows stream in.
- Images go through `next/image` with AVIF/WebP negotiation, lazy loading, and
  responsive `sizes`.
- `next.config.js` sets `output: "standalone"` for a minimal Docker image and enables
  `optimizePackageImports` for `lucide-react`/`framer-motion` to reduce bundle size.
- Run `npx lighthouse http://localhost:3000 --view` after a production build
  (`npm run build && npm run start`) to audit against the 95+ target — dev mode
  scores will be misleadingly low.

## Deployment

### Frontend → Vercel
1. Import the `frontend/` directory as the project root.
2. Set `NEXT_PUBLIC_API_URL` to your deployed backend URL and `NEXT_PUBLIC_SITE_URL`
   to your production domain.
3. Vercel auto-detects Next.js; no build command changes needed.

### Backend → Railway or Render
1. Point the service at `backend/` with the provided `Dockerfile`.
2. Set env vars from `.env.example` (`DATABASE_URL` → your Supabase connection
   string, `REDIS_URL` → a managed Redis add-on, `JWT_SECRET`, `CORS_ORIGINS`
   including your Vercel domain).
3. Run `alembic upgrade head` as a release/pre-deploy command.

### Database → Supabase Postgres
1. Create a project, copy the connection string into `DATABASE_URL`
   (use the `asyncpg`-compatible form: `postgresql+asyncpg://...`).
2. Run migrations from your local machine or a one-off Railway/Render job.

### CDN → Cloudflare
Point your domain's DNS through Cloudflare in front of Vercel for edge caching of
static assets; enable "Always Use HTTPS" and Auto Minify. API responses already
carry cache headers via Redis + `next: { revalidate }`, so Cloudflare mainly helps
with static assets and DDoS protection.

## API rate limits & caching etiquette

Jikan enforces ~3 req/sec / 60 req/min publicly. The backend's Redis cache absorbs
nearly all repeat traffic, and `jikan_client.py` backs off with a short sleep on
`429` responses. If you scale past a few thousand daily active users, consider
self-hosting a Jikan-compatible cache (Jikan itself is open source and cache-backed)
rather than hitting the public instance directly.

## License / attribution

Anime data is sourced from the Jikan API (unofficial MyAnimeList wrapper) and the
AniList GraphQL API. Anibinge is not affiliated with MyAnimeList or AniList. No
scraping is performed — only official public APIs are used.
