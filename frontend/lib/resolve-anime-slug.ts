const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ANILIST_API = "https://graphql.anilist.co";

const EXIST_BY_ID = `query($id:Int){Media(id:$id,type:ANIME){id}}`;
const EXIST_BY_MAL = `query($idMal:Int){Media(idMal:$idMal,type:ANIME){id}}`;

const SEARCH_QUERY = `query($q:String){
  Page(page:1,perPage:5){
    media(search:$q,type:ANIME,isAdult:false,sort:SEARCH_MATCH){
      id idMal title{english romaji native}
    }
  }
}`;

export interface SlugResolution {
  id: number;
  source: "mal" | "anilist";
}

export function slugToQuery(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/-(season|s)$/i, "")
    .trim();
}

type Existence = "found" | "not-found" | "error";

export type SlugStatus =
  | { status: "found"; id: number; source: "mal" | "anilist" }
  | { status: "missing" }
  | { status: "error" };

export async function resolveAnimeSlug(slug: string): Promise<SlugResolution | null> {
  const result = await resolveAnimeSlugStatus(slug);
  return result.status === "found" ? { id: result.id, source: result.source } : null;
}

/**
 * Resolve a slug like "one-piece" to its numeric AniList / MAL id.
 * Returns a tri-state so callers can distinguish a definitive "no such
 * anime" from "AniList unreachable" (which must fail open, since AniList
 * 403s from the CF Workers edge).
 */
export async function resolveAnimeSlugStatus(slug: string): Promise<SlugStatus> {
  const q = slugToQuery(slug);
  if (!q) return { status: "missing" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q } }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!resp.ok) return { status: "error" };
    const data = await resp.json();
    if (data.errors) return { status: "error" };
    const media = data?.data?.Page?.media || [];
    const m = media[0];
    if (!m) return { status: "missing" };

    const id = m.idMal || m.id;
    const source = m.idMal ? "mal" : "anilist";
    return { status: "found", id, source };
  } catch {
    clearTimeout(timeout);
    return { status: "error" };
  }
}

async function queryExists(query: string, vars: Record<string, number>): Promise<Existence> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: vars }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!resp.ok) return "error";
    const data = await resp.json();
    if (data.errors) return "error";
    return data?.data?.Media ? "found" : "not-found";
  } catch {
    clearTimeout(timeout);
    return "error";
  }
}

/**
 * Check whether an anime exists by id. Returns true when AniList confirms it
 * exists, or when AniList could NOT be reached (fail open). Only returns false
 * when every query definitively says the anime does not exist.
 */
export async function animeIdExists(id: number, source: "mal" | "anilist" = "mal"): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;

  if (source === "anilist") {
    const byId = await queryExists(EXIST_BY_ID, { id });
    if (byId === "found") return true;
    const byMal = await queryExists(EXIST_BY_MAL, { idMal: id });
    if (byMal === "found") return true;
    return !(byId === "not-found" && byMal === "not-found");
  }

  const byMal = await queryExists(EXIST_BY_MAL, { idMal: id });
  if (byMal === "found") return true;
  const byId = await queryExists(EXIST_BY_ID, { id });
  if (byId === "found") return true;
  return !(byMal === "not-found" && byId === "not-found");
}
