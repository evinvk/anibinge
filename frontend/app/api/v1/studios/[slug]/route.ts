import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GRAPHQL = "https://graphql.anilist.co";

const STUDIO_QUERY = `query($search:String,$page:Int){
  Studio(search:$search,isAnimationStudio:true){
    id name siteUrl isAnimationStudio
    media(sort:POPULARITY_DESC,page:$page,perPage:24,type:ANIME,isAdult:false){
      pageInfo{ hasNextPage }
      nodes{
        id idMal title{english romaji native}
        coverImage{large} bannerImage
        averageScore popularity
        genres
        startDate{year}
        episodes status
      }
    }
  }
}`;

function normalizeMedia(m: any) {
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  return {
    id: m.idMal || m.id,
    source: m.idMal ? "mal" : "anilist",
    title,
    title_english: m.title?.english || null,
    image: m.coverImage?.large || null,
    banner: m.bannerImage || null,
    score: m.averageScore ? m.averageScore / 10 : null,
    popularity: m.popularity || null,
    genres: m.genres || [],
    year: m.startDate?.year || null,
    episodes: m.episodes || null,
    status: m.status || null,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = slug.replace(/-/g, " ");

  try {
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: STUDIO_QUERY, variables: { search, page } }),
      next: { revalidate: 86400 },
    });
    if (!resp.ok) throw new Error(`AniList ${resp.status}`);
    const data = await resp.json();
    const studio = data?.data?.Studio;
    if (!studio) return NextResponse.json({ error: "Studio not found" }, { status: 404 });

    const nodes = studio.media?.nodes || [];
    return NextResponse.json({
      data: {
        id: studio.id,
        name: studio.name,
        site_url: studio.siteUrl,
        items: nodes.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia),
        has_next: !!studio.media?.pageInfo?.hasNextPage,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
