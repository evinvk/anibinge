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

export async function resolveAnimeSlug(slug: string): Promise<SlugResolution | null> {
  const q = slugToQuery(slug);
  if (!q) return null;

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
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.errors) return null;
    const media = data?.data?.Page?.media || [];
    const m = media[0];
    if (!m) return null;

    const id = m.idMal || m.id;
    const source = m.idMal ? "mal" : "anilist";
    return { id, source };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function queryExists(query: string, vars: Record<string, number>): Promise<boolean> {
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
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data.errors) return false;
    return !!data?.data?.Media;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

export async function animeIdExists(id: number, source: "mal" | "anilist" = "mal"): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;

  if (source === "anilist") {
    const byId = await queryExists(EXIST_BY_ID, { id });
    if (byId) return true;
    return queryExists(EXIST_BY_MAL, { idMal: id });
  }

  const byMal = await queryExists(EXIST_BY_MAL, { idMal: id });
  if (byMal) return true;
  return queryExists(EXIST_BY_ID, { id });
}
