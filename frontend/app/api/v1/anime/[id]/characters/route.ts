import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GRAPHQL = "https://graphql.anilist.co";

const CHAR_QUERY = `query($id:Int){Media(id:$id,type:ANIME){
  characters(page:1,perPage:50,sort:ROLE){
    edges{role node{id name nameFull image{large}} voiceActors{id nameFull image{large}}}
  }
}}`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const id = parseInt(segments[segments.length - 2]);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Try Jikan first
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/anime/${id}/characters`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return NextResponse.json({ data: data.data || [] });
    }
  } catch {}

  // Fallback: AniList
  try {
    const malQuery = `query($ids:[Int]){Page(page:1,perPage:1){media(idMal_in:$ids,type:ANIME){id}}}`;
    const malResp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: malQuery, variables: { ids: [id] } }),
    });
    if (!malResp.ok) return NextResponse.json({ data: [] });
    const malData = await malResp.json();
    const anilistId = malData?.data?.Page?.media?.[0]?.id;
    if (!anilistId) return NextResponse.json({ data: [] });

    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: CHAR_QUERY, variables: { id: anilistId } }),
    });
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    const edges = data?.data?.Media?.characters?.edges || [];
    const results = edges.map((e: any) => ({
      character: {
        mal_id: null,
        id: e.node?.id,
        name: e.node?.nameFull || e.node?.name || "",
        images: { jpg: { image_url: e.node?.image?.large || null } },
      },
      role: e.role,
      voice_actors: (e.voiceActors || []).map((va: any) => ({
        person: { name: va.nameFull || va.name || "", images: { jpg: { image_url: va.image?.large || null } } },
      })),
    }));
    return NextResponse.json({ data: results });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
