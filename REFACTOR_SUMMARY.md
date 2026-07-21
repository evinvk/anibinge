# Refactor Summary: Multi-Source Anime Data Aggregation with Fallback Chain

## Overview
This refactor transforms the anibinge backend from a single-source (Jikan) architecture to a **multi-source aggregation system** with intelligent fallbacks: **MAL (primary) → AniList (secondary) → Jikan (fallback)**.

The new architecture ensures:
- **Higher availability**: If one source fails, gracefully fallback to others
- **Better data quality**: MAL has official metadata, AniList has comprehensive GraphQL, Jikan has reliable episode data
- **Comprehensive coverage**: Combines strengths of all three sources
- **Unified API**: Frontend sees one consistent data schema regardless of source

---

## Key Changes

### 1. **New Services**

#### `anilist_client.py` (NEW)
- Comprehensive AniList GraphQL client with all methods:
  - `search_anime()` - Search by title
  - `get_trending()` - Trending anime
  - `get_popular()` - Most popular anime
  - `get_top()` - Top-rated anime
  - `get_seasonal()` - Anime by season/year
  - `get_schedule()` - Currently airing anime
  - `get_anime_detail()` - Detailed anime info
  - `get_recommendations()` - Similar anime
  - `get_character()` - Character details
  - `get_studio()` - Studio anime catalog
- Built-in retry logic using `tenacity` library
- Proper error handling and logging

#### `aggregator.py` (REFACTORED)
- **Core innovation**: Implements intelligent fallback chain
- 10 main methods with MAL → AniList → Jikan fallbacks:
  - `get_trending()` - Trending anime
  - `search()` - Search anime
  - `get_detail()` - Detailed anime info
  - `get_top()` - Top-rated anime
  - `get_seasonal()` - Seasonal anime
  - `get_schedule()` - Airing anime
  - `get_recommendations()` - Similar anime
  - `get_characters()` - Character list
  - `get_staff()` - Staff information
  - `get_genres()` - All genres

- **Normalization functions**: Convert each source to consistent schema
  - `_normalize_mal()` - Normalize MyAnimeList format
  - `_normalize_anilist()` - Normalize AniList format
  - `_normalize_jikan()` - Normalize Jikan format

- **Denormalization functions**: Expand normalized data for detailed responses
  - `_denormalize_mal_detail()`
  - `_denormalize_anilist_detail()`
  - `_denormalize_jikan_detail()`

- **Error handling**: Each method catches exceptions and logs source failures
- **Caching**: All methods use Redis decorator with appropriate TTLs

### 2. **Updated Routers**

#### `anime.py` (ENHANCED)
- **New endpoints**:
  - `GET /api/v1/anime/trending` - Trending anime (MAL → AniList → Jikan)
  - `GET /api/v1/anime/top-rated` - Top-rated anime
  - `GET /api/v1/anime/airing` - Currently airing anime
  - `GET /api/v1/anime/upcoming` - Upcoming anime
  - `GET /api/v1/anime/{anime_id}` - Anime detail with source parameter
  - `GET /api/v1/anime/{anime_id}/characters` - Characters
  - `GET /api/v1/anime/{anime_id}/staff` - Staff
  - `GET /api/v1/anime/{anime_id}/episodes` - Episodes (Jikan primary for best data)
  - `GET /api/v1/anime/{anime_id}/recommendations` - Similar anime

- **Improvements**:
  - Proper error handling with HTTPException
  - Source preference parameter (default: MAL)
  - Logging for all operations
  - Async/await throughout

#### `search.py` (ENHANCED)
- `GET /api/v1/search?q={query}` - Search with fallback chain
- `GET /api/v1/search/genres` - All available genres
- Support for filters: genres, status, type, rating, score, ordering

#### `seasonal.py` (ENHANCED)
- `GET /api/v1/seasonal/current` - Current season
- `GET /api/v1/seasonal/{year}/{season}` - Any season/year
- Auto-detects current season/year
- Input validation for year bounds (1917 to current_year + 2)

#### `schedule.py` (ENHANCED)
- `GET /api/v1/schedule/weekly` - All 7 days in parallel
- `GET /api/v1/schedule/{day}` - Specific day schedule
- Parallel fetching for better performance
- Timezone offset support for client-side time display

#### `watchlist.py` (UNCHANGED)
- User watchlist management (authentication required)
- CRUD operations for watchlist entries
- PostgreSQL upsert for efficient storage

#### `news.py` (UNCHANGED)
- AnimeNewsNetwork integration
- News, reviews, rankings, encyclopedia search

#### `streaming.py` (UNCHANGED)
- Wibu API integration for streaming
- Episode sources, subtitles, servers
- Direct play URLs

### 3. **Core Infrastructure Updates**

#### `main.py` (ENHANCED)
- **New error handlers**:
  - Unhandled exception handler (500)
  - ValueError handler (400)
  
- **New middleware**:
  - Request logging with timing (all HTTP requests logged)
  - Response headers with processing time

- **Updated description**:
  ```
  "Aggregated anime data API — MAL (primary) + AniList (secondary) + Jikan (fallback) for metadata, 
   Wibu API for streaming."
  ```

- **Rate limiting**: Using `slowapi` (already configured)

#### `requirements.txt` (UPDATED)
- Added: `tenacity==8.2.3` - For retry logic in clients

#### `schemas/schemas.py` (NEW)
Pydantic models for validation and documentation:
- `AnimeBase` - Basic anime info
- `AnimeDetail` - Extended anime details
- `SearchResult` - Search response wrapper
- `TrendingResult` - Trending response wrapper
- `GenreItem` - Genre info
- `CharacterNode` - Character info
- `StaffNode` - Staff info
- `EpisodeNode` - Episode info
- `RecommendationNode` - Recommendation info
- `HealthResponse` - Health check response

---

## Architecture Diagram

```
Frontend Request
    ↓
Router (anime.py, search.py, seasonal.py, etc.)
    ↓
Aggregator Service
    ├─→ Try MAL Client (Primary)
    │   └─→ On error:
    ├─→ Try AniList Client (Secondary)
    │   └─→ On error:
    └─→ Try Jikan Client (Fallback)
        └─→ On error: Return error/empty result
    ↓
Normalize to consistent schema
    ↓
Redis Cache (if configured)
    ↓
Return to Frontend
```

---

## Caching Strategy

| Endpoint Type | TTL | Rationale |
|---|---|---|
| Trending, Schedule | 1 hour (SHORT) | Changes frequently |
| Seasonal, Top, Detail, Recommendations | 6 hours (MEDIUM) | Relatively stable |
| Genres | 24 hours (LONG) | Never changes |

Default TTLs from `settings.CACHE_TTL_*` (configurable via .env)

---

## Error Handling Strategy

1. **Source Fallback Chain**: Each method tries sources in order
2. **Logging**: Failed attempts logged at WARN level, all errors at ERROR level
3. **HTTP Exceptions**: 
   - 400: Invalid input (e.g., bad season)
   - 404: Not found (anime doesn't exist)
   - 503: Service unavailable (all sources failed)
   - 502: Upstream error (HTTP status error from data source)
4. **Request Logging**: All HTTP requests logged with method, path, status, duration

---

## Backwards Compatibility

✅ **Fully backwards compatible** with existing frontend code:
- All endpoints maintain same URL paths
- Response schemas are consistent
- Query parameters unchanged
- Authentication/authorization unchanged

---

## Testing Recommendations

### Unit Tests
- Test normalization functions with sample data from each source
- Test fallback chain behavior (mock source failures)
- Test error handling paths

### Integration Tests
- Test full request flow through aggregator
- Test cache behavior
- Test rate limiting
- Test error scenarios

### Load Tests
- Verify parallel operations in schedule/weekly endpoint
- Verify cache hit performance
- Verify fallback chain doesn't cause excessive latency

---

## Deployment Notes

1. **Update requirements.txt**: `pip install -r requirements.txt`
   - New dependency: `tenacity`

2. **Environment variables**: No new required env vars
   - Existing `REDIS_URL`, `MAL_*`, `JIKAN_*` still used
   - Optional: Configure cache TTLs via `.env`

3. **Database**: No migrations needed
   - Watchlist schema unchanged

4. **Monitoring**: Watch logs for:
   - Source failures (WARN level)
   - Fallback chain exhaustion (ERROR level)
   - Cache hit rates

---

## Future Enhancements

1. **Multi-language support**: Leverage AniList's title translations
2. **Advanced filtering**: Genre combinations, score ranges, year ranges
3. **User preferences**: Remember source preferences per user
4. **Analytics**: Track which source provides best data for which queries
5. **Custom caching**: Different TTLs for different anime (popular vs. obscure)
6. **Metrics export**: Prometheus metrics for source availability, fallback frequency

---

## Files Changed

### New Files
- `backend/app/services/anilist_client.py` - AniList GraphQL client
- `backend/app/schemas/__init__.py` - Schemas package
- `backend/app/schemas/schemas.py` - Pydantic models

### Modified Files
- `backend/app/services/aggregator.py` - Complete refactor with fallback chain
- `backend/app/routers/anime.py` - Updated to use aggregator
- `backend/app/routers/search.py` - Updated to use aggregator
- `backend/app/routers/seasonal.py` - Updated to use aggregator
- `backend/app/routers/schedule.py` - Updated to use aggregator
- `backend/app/main.py` - Enhanced error handling and logging
- `backend/requirements.txt` - Added tenacity

### Unchanged Files
- `backend/app/routers/watchlist.py` - No changes needed
- `backend/app/routers/news.py` - No changes needed
- `backend/app/routers/streaming.py` - No changes needed
- All database/auth/core files - No changes needed

---

## Migration Steps

1. Create feature branch: `refactor/anilist-primary-jikan-fallback`
2. Apply all changes above
3. Test locally against MAL, AniList, and Jikan APIs
4. Run integration tests
5. Create PR with this summary
6. Code review for fallback logic, error handling, caching strategy
7. Merge to main
8. Deploy to staging
9. Run full E2E tests against staging
10. Deploy to production

---

## Rollback Plan

If issues occur after deployment:

1. **Option A - Disable AniList/MAL** (instant):
   - Set environment variables to disable MAL/AniList clients
   - Aggregator falls back to Jikan (original behavior)

2. **Option B - Revert commit** (requires redeploy):
   - `git revert <commit-hash>`
   - Redeploy from main branch

3. **Option C - Circuit breaker** (TODO - future enhancement):
   - Auto-disable source if failure rate exceeds threshold
   - Automatic recovery after cooldown period

---

## Questions & Troubleshooting

**Q: Why MAL first, then AniList, then Jikan?**
A: MAL has official metadata, AniList has best GraphQL interface, Jikan is most reliable for edge cases.

**Q: What if all sources fail?**
A: Returns HTTP 503 (Service Unavailable) with descriptive error message. Logs all failures for debugging.

**Q: How is caching handled?**
A: Redis cache with configurable TTLs per endpoint type. Cache key includes source preference.

**Q: Can I force a specific source?**
A: Yes, most endpoints accept optional `source` parameter. Default is "mal".

**Q: What about ID mapping between sources?**
A: Each source has different ID spaces. Watchlist entries store both `anime_id` and `source`. Aggregator handles this transparently.
